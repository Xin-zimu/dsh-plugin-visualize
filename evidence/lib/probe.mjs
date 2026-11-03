/**
 * The one parameterized browser probe: gates first, measurement second.
 *
 * ## Why this replaces a folder of numbered scripts
 *
 * 4A-1 accumulated 41 scripts, 31 of them numbered `a1-s2` … `a1-s32`. Most were
 * not measurements — they were attempts to get *anything* to render while the
 * environment was broken. The waste was not "too many tests"; it was that a
 * dead host was treated as a product defect and debugged by trial and error for
 * dozens of runs instead of being diagnosed once and stopping.
 *
 * This file inverts that. `--what=smoke` runs four gates **before** any product
 * measurement is allowed:
 *
 * | Gate | Question | Fails loudly when |
 * | --- | --- | --- |
 * | **G0** environment | is the CLI/extension matched, is the installed bundle the build under test, and does the page load its own session? | a version skew, a stale bundle, or an error banner such as `job/registered` / `历史加载失败` |
 * | **G1** input | does `fill` deliver the whole text in one action? | the editor is empty, truncated, or crashes on the write |
 * | **G2** submit | does `Enter` actually submit, rather than only filling the box? | the composer keeps its text, or no message appears |
 * | **G3** render | do the user turn, the assistant turn and the page shell paint? | the conversation pane is blank despite HTTP 200 |
 *
 * A production measurement (`card`, `theme`, `tokens`) refuses to run unless a
 * smoke pass is recorded and fresh. **An environment failure is reported as
 * blocked, never as a product failure** — exit code 2 versus exit code 1 — so it
 * can never be filed as "the component is broken".
 *
 * ## Usage
 *
 * ```sh
 * node evidence/lib/probe.mjs --what=smoke
 * node evidence/lib/probe.mjs --what=card    --title="A1 layout"
 * node evidence/lib/probe.mjs --what=theme   --want=dark
 * node evidence/lib/probe.mjs --what=tokens
 * ```
 *
 * Default output is a small structured summary. `--out <file>` additionally
 * writes the full detail, so a transcript never has to carry it.
 *
 * Exit codes: `0` pass, `1` a product check failed, `2` the environment blocked
 * the run, `3` usage error.
 *
 * @module dsh-plugin-visualize/evidence/lib/probe
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  evaluate, fill, press, reload, screenshot, SESSION, SLEEP, SLEEP as _sleep,
} from './cdp.mjs'

void _sleep

/** Where the last smoke pass is recorded, and how long it stays valid. */
const STAMP = 'evidence/.smoke-stamp.json'
const STAMP_TTL_MS = 45 * 60 * 1000

/** Marks a run that never reached the product, so it cannot be logged as a defect. */
class Blocked extends Error {
  /** @param reason - one line naming the failed precondition. */
  constructor(reason) {
    super(reason)
    this.name = 'Blocked'
  }
}

// --- argument handling ------------------------------------------------------

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const hit = argv.find(item => item.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const has = name => argv.includes(`--${name}`)

const WHAT = arg('what', 'smoke')
const TITLE = arg('title', 'A1 layout')
const WANT = arg('want', '')
const OUT = arg('out', '')
const BUILD = arg('build', 'lib')
const INSTALLED = arg('installed', 'tmp/dsh-p3/profiles/p3web/node_modules/@dsh-unified/visualize/lib')
const FORCE = has('force')

/** Detail lines; printed only with --full, always written with --out. */
const detail = []
const say = line => detail.push(line)

/**
 * Print the concise summary this run is judged by.
 *
 * A `detail` key is written to the evidence file and **not** printed: it exists
 * for the 470-entry tables that must be recorded but must never reach a
 * transcript. This is the rule the harness exists to enforce, applied to itself.
 */
function summary(facts) {
  const { detail: deep, ...brief } = facts
  console.log(JSON.stringify(brief, null, 1))
  if (OUT !== '') {
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), what: WHAT, facts, detail }, null, 1)}\n`)
  }
  if (deep !== undefined) {
    console.error(`(detail written to ${OUT === '' ? 'nowhere — pass --out to keep it' : OUT})`)
  }
}

// --- G0: environment --------------------------------------------------------

/** SHA-256 of a file, or null when absent. */
function sha256(file) {
  return existsSync(file)
    ? createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()
    : null
}

/**
 * Gate 0 — can this environment be measured at all?
 *
 * Five independent ways for a browser run to be meaningless, all cheap to check
 * and all fatal. They are checked in ascending cost, so the common failures are
 * reported before anything is dispatched at the page:
 *
 * 1. **No daemon, or a protocol skew.** CLI 0.4.0 against extension 0.4.1 made
 *    every `fill` crash the host's draft editor in 4A-1, which read like a plugin
 *    defect for ten runs.
 * 2. **The agent tab is not on the app.** A fresh agent window opens on
 *    `about:blank`; against that tab `evaluate` does not fail, it *hangs*, which
 *    is how a 20-second check once became a three-minute background job.
 *    `tab list` needs no cooperation context, so this is answered first.
 * 3. **A stale bundle.** `dsh plugin add` copies `lib/` at install time, so a
 *    build made afterwards leaves the profile on old code.
 * 4. **A session this host cannot read.** A log written by a newer harness makes
 *    `dsh` refuse the conversation outright — the page shows a banner and the
 *    pane stays blank however many prompts succeed.
 * 5. **A host draft-editor crash**, which the console reports long before the UI
 *    admits anything is wrong.
 */
async function gateEnvironment() {
  const gaps = []
  const facts = { gate: 'G0', name: 'environment' }

  // 1. CLI and extension versions.
  let status
  try {
    status = JSON.parse(execFileSync('bsk', ['status', '--json'], {
      encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
    }))
  } catch (error) {
    throw new Blocked(`bsk daemon is not reachable: ${String(error.message).split('\n')[0]}`)
  }
  facts.daemonVersion = status.daemon_version
  facts.protocolVersion = status.protocol_version
  if ((status.version_skew_browsers ?? []).length > 0) {
    const skew = status.version_skew_browsers[0]
    gaps.push(`protocol skew: cli ${skew.server_version}/${skew.server_protocol_version} vs extension ${skew.client_version}/${skew.client_protocol_version} — run \`bsk update -y\` and restart the daemon`)
  }
  if (SESSION === '') gaps.push('BSK_SESSION is not set; nothing to measure')
  if ((status.sessions ?? []).length === 0) gaps.push('no active agent-window session — run `bsk session start`')

  // 2. The agent tab must be on a real page. Answered without dispatching at the
  //    page at all, because evaluating against `about:blank` hangs instead of
  //    returning an error.
  if (SESSION !== '') {
    try {
      const tabs = JSON.parse(execFileSync('bsk', ['tab', 'list', '--session', SESSION, '--json'], {
        encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' }, timeout: 30000,
      }))
      const agent = (tabs.tabs ?? []).find(tab => tab.scope === 'agent')
      facts.agentTab = agent === undefined ? null : { url: agent.url, title: agent.title }
      if (agent === undefined) gaps.push('the session has no agent tab')
      else if (/^about:/u.test(agent.url ?? '')) {
        gaps.push(`the agent tab is still ${agent.url} — it must be navigated to the DSH app before measuring`)
      }
    } catch (error) {
      // Do not fold this into a generic "could not list tabs": the two causes
      // need different fixes. A timeout means another client is holding the
      // session (very likely when two agents share one), and retrying or
      // using a private session is the answer. Anything else is a real fault.
      const detail = String(error.message).split('\n').filter(Boolean).slice(-3).join(' | ')
      gaps.push(`could not list the session's tabs (bsk tab list failed: ${detail.slice(0, 200)}) — if this is a timeout, another client is holding session ${SESSION}; use your own session`)
    }
  }

  // 3. The bundle the profile installed must be the build under test.
  const buildHash = sha256(`${BUILD}/client.js`)
  const installedHash = sha256(`${INSTALLED}/client.js`)
  facts.buildSha256 = buildHash
  facts.installedSha256 = installedHash
  if (buildHash === null) gaps.push(`${BUILD}/client.js is missing — run \`npx tsdown\``)
  else if (installedHash === null) gaps.push(`${INSTALLED}/client.js is missing — the profile has no plugin installed`)
  else if (buildHash !== installedHash) {
    gaps.push(`bundle mismatch: build ${buildHash.slice(0, 12)}… vs installed ${installedHash.slice(0, 12)}… — copy lib/ into the profile before measuring`)
  }

  // Everything so far is answerable without touching the page. If any of it
  // already failed, stop here: evaluating a blank tab would hang.
  if (gaps.length > 0) {
    facts.gaps = gaps
    throw new Blocked(`G0 environment: ${gaps.join(' | ')}`)
  }

  // 4. The page must be able to load its own session.
  let page
  try {
    page = await evaluate(`(function () {
      const text = document.body.innerText || '';
      return JSON.stringify({
        title: document.title,
        url: location.href.replace(/token=[^&]+/, 'token=…'),
        hasComposer: document.querySelector('[contenteditable=true][role=textbox]') !== null,
        cards: document.querySelectorAll('[data-openui-card]').length,
        // Banners that mean "this build cannot read this session".
        unreadableLog: /历史加载失败|failed to observe session|unknown to this harness|refusing to interpret the log/.test(text),
        excerpt: text.slice(0, 160),
      });
    })()`)
  } catch (error) {
    throw new Blocked(`the page could not be evaluated: ${String(error.message).split('\n')[0]}`)
  }
  facts.page = page
  if (page.unreadableLog) {
    gaps.push('the page refuses to load its session log (written by a newer harness) — start a fresh session; this state cannot be measured')
  }
  if (!page.hasComposer) gaps.push('no composer on the page — is this the DSH app root?')

  // 5. A crashing draft editor is a host defect the console reports before the
  //    UI shows anything. Worth naming explicitly: it looks like a send failure.
  try {
    const console = JSON.parse(execFileSync('bsk', ['console', '--session', SESSION, '--json'], {
      encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' }, timeout: 15000,
    }))
    const crashes = (console.entries ?? []).filter(entry => /text\.replace is not a function/u.test(entry.text ?? ''))
    facts.draftEditorCrashes = crashes.length
    if (crashes.length > 0) {
      gaps.push(`${crashes.length} host draft-editor crash(es) in the console (DraftEditorRuntime.setDraft) — the composer will accept text and never submit; start a fresh session`)
    }
    say(`console entries: ${(console.entries ?? []).length}, draft-editor crashes: ${crashes.length}`)
  } catch {
    say('console could not be read; continuing without it')
  }

  facts.gaps = gaps
  if (gaps.length > 0) throw new Blocked(`G0 environment: ${gaps.join(' | ')}`)
  return facts
}

// --- G1–G3: interaction -----------------------------------------------------

const COMPOSER = '[contenteditable=true][role=textbox]'
const SEND = 'button[aria-label="发送消息"], button[aria-label="Send message"]'

/** Empty the composer without asserting anything about submission. */
async function emptyComposer() {
  const before = await evaluate(`JSON.stringify({ n: (document.querySelector('${COMPOSER}')?.textContent || '').length })`)
  if (before.n === 0) return
  await evaluate(`(function () {
    const box = document.querySelector('${COMPOSER}');
    box.focus();
    const range = document.createRange();
    range.selectNodeContents(box);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return JSON.stringify({ ok: true });
  })()`)
  await press('Backspace')
  await SLEEP(300)
}

/**
 * Gate 1 — does `fill` deliver a whole value in one action?
 *
 * The value is deliberately long enough that a truncating implementation shows
 * up, and contains a non-ASCII word so an encoding bug surfaces here rather than
 * midway through a card program.
 */
async function gateInput() {
  const probe = `SMOKE-${Date.now().toString(36)} 中文 ASCII-1234 结尾`
  await emptyComposer()
  await fill(COMPOSER, probe)
  await SLEEP(600)

  const got = await evaluate(`(function () {
    const box = document.querySelector('${COMPOSER}');
    return JSON.stringify({ text: box === null ? null : (box.textContent || ''), sendDisabled: (document.querySelector('${SEND}') || {}).disabled ?? null });
  })()`)

  const facts = { gate: 'G1', name: 'input', sent: probe.length, received: got.text === null ? null : got.text.length }
  if (got.text === null) throw new Blocked('G1 input: the composer disappeared after fill')
  if (got.text.length === 0) throw new Blocked('G1 input: fill left the composer empty — the editor rejected the value')
  if (!got.text.includes(probe)) {
    throw new Blocked(`G1 input: fill delivered ${got.text.length} of ${probe.length} characters — the value was truncated or transformed`)
  }
  return facts
}

/**
 * Gate 2 — does `Enter` submit, rather than merely filling the box?
 *
 * Three independent pieces of evidence, because each alone can lie: the composer
 * clearing can happen on a failed send, and a new message row can appear while
 * the turn never starts. The check is that the composer is empty **and** the
 * probe text now appears in the conversation rather than the editor.
 */
async function gateSubmit() {
  const marker = `SMOKE-${Date.now().toString(36)}`
  await emptyComposer()
  await fill(COMPOSER, `Reply with exactly: ${marker}`)
  await SLEEP(500)
  await press('Enter')
  await SLEEP(5000)

  const facts = { gate: 'G2', name: 'submit', marker }
  let state
  for (let i = 0; i < 40; i += 1) {
    state = await evaluate(`(function () {
      const box = document.querySelector('${COMPOSER}');
      const composerText = box === null ? '' : (box.textContent || '');
      const body = document.body.innerText || '';
      return JSON.stringify({
        composerLength: composerText.length,
        sent: composerText === '' || !composerText.includes(${JSON.stringify(marker)}),
        echoed: body.includes(${JSON.stringify(marker)}),
      });
    })()`)
    if (state.sent && state.echoed) break
    await SLEEP(1500)
  }
  facts.composerLength = state.composerLength
  facts.echoed = state.echoed
  if (!state.sent) throw new Blocked('G2 submit: the composer still holds the text after Enter — nothing was submitted')
  if (!state.echoed) throw new Blocked('G2 submit: the composer cleared but the message never appeared in the conversation')
  return facts
}

/**
 * Gate 3 — does the conversation actually paint?
 *
 * G2 proves the message was accepted; this proves the host can render a turn at
 * all. In 4A-1 three prompts returned HTTP 200 while the pane stayed blank, and
 * the missing piece of evidence was exactly this one.
 */
async function gateRender() {
  let state
  for (let i = 0; i < 40; i += 1) {
    state = await evaluate(`(function () {
      const text = document.body.innerText || '';
      const paragraphs = [...document.querySelectorAll('p')].map(el => (el.textContent || '').trim()).filter(Boolean);
      return JSON.stringify({
        paragraphs: paragraphs.length,
        // The assistant turn has settled when its status stops saying "running".
        settled: !/正在|运行中|Running|Generating/.test(text),
        excerptTail: text.slice(-240),
      });
    })()`)
    if (state.paragraphs >= 2 && state.settled) break
    await SLEEP(1500)
  }
  const facts = { gate: 'G3', name: 'render', paragraphs: state.paragraphs, settled: state.settled }
  if (state.paragraphs < 2) {
    throw new Blocked(`G3 render: only ${state.paragraphs} paragraph(s) painted — the conversation pane is not rendering`)
  }
  if (!state.settled) throw new Blocked('G3 render: the turn never settled')
  return facts
}

/** Run all four gates in order, stopping at the first failure. */
async function smoke() {
  const gates = []
  gates.push(await gateEnvironment())
  gates.push(await gateInput())
  gates.push(await gateSubmit())
  gates.push(await gateRender())

  mkdirSync(dirname(STAMP), { recursive: true })
  writeFileSync(STAMP, JSON.stringify({
    at: new Date().toISOString(),
    session: SESSION,
    buildSha256: gates[0].buildSha256,
    installedSha256: gates[0].installedSha256,
  }, null, 1))
  return { verdict: 'SMOKE PASS', gates, stamp: STAMP }
}

// --- product measurements ---------------------------------------------------

/**
 * Refuse to measure a product without a fresh smoke pass.
 *
 * `--force` exists for diagnosis, and using it is recorded in the output so a
 * result taken without the gates cannot pass as one taken with them.
 */
function requireSmoke() {
  if (FORCE) {
    console.log('WARNING: --force skips the smoke gate; this result is not gate-backed')
    return { forced: true }
  }
  if (!existsSync(STAMP)) {
    throw new Blocked('no smoke pass recorded — run `--what=smoke` before any product measurement')
  }
  const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
  const age = Date.now() - Date.parse(stamp.at)
  if (Number.isNaN(age) || age > STAMP_TTL_MS) {
    throw new Blocked(`the smoke pass is ${Math.round(age / 60000)} minutes old (limit ${STAMP_TTL_MS / 60000}) — re-run \`--what=smoke\``)
  }
  if (stamp.session !== SESSION) {
    throw new Blocked(`the smoke pass was for session ${stamp.session}, not ${SESSION} — re-run \`--what=smoke\``)
  }
  return { stamp, ageMs: age }
}

/** Every measurement starts from the current build, not a remembered one. */
async function card() {
  const gate = requireSmoke()
  const report = await evaluate(`(function () {
    const TITLE = ${JSON.stringify(TITLE)};
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const hits = cards.filter(c => (c.textContent || '').includes(TITLE));
    if (hits.length === 0) return JSON.stringify({ found: false, cards: cards.length });
    const card = hits[hits.length - 1];
    const style = el => getComputedStyle(el);
    const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    const nodes = [...card.querySelectorAll('*')];

    // Three layers, because a var() that resolves to nothing still paints a
    // plausible fallback: referenced -> declared on the root -> host token exists.
    const rootStyle = style(card);
    const declared = new Set();
    for (let i = 0; i < rootStyle.length; i += 1) {
      const name = rootStyle[i];
      if (name.startsWith('--')) declared.add(name);
    }
    const bodyStyle = style(document.body);
    const referenced = new Set();
    for (const el of [card, ...nodes]) {
      for (const m of (el.getAttribute('style') || '').matchAll(/var\\((--[a-z0-9-]+)/gi)) referenced.add(m[1]);
    }
    const variables = [...referenced].sort().map(name => {
      const value = rootStyle.getPropertyValue(name).trim();
      const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;
      return {
        name,
        declaredOnRoot: declared.has(name),
        hostToken,
        hostResolves: hostToken === null ? null : bodyStyle.getPropertyValue(hostToken).trim() !== '',
        value: value.slice(0, 60),
      };
    });

    return JSON.stringify({
      found: true,
      copies: hits.length,
      theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
      cardWidth: box(card).w,
      unresolved: variables.filter(v => !v.declaredOnRoot).map(v => v.name),
      danglingHostTokens: variables.filter(v => v.hostResolves === false).map(v => v.hostToken),
      variables,
      boxes: nodes.filter(el => style(el).display === 'flex' && (el.getAttribute('style') || '').includes('box-sizing')).map(el => ({
        text: (el.textContent || '').slice(0, 18),
        ...box(el),
        background: style(el).backgroundColor,
        borderWidth: style(el).borderTopWidth,
        borderStyle: style(el).borderTopStyle,
        padding: style(el).padding,
        flex: style(el).flex,
      })),
      grids: nodes.filter(el => style(el).display === 'grid').map(el => ({
        ...box(el),
        tracks: style(el).gridTemplateColumns.split(' ').filter(Boolean).length,
        template: style(el).gridTemplateColumns,
        gap: style(el).gap,
        items: el.children.length,
      })),
      dividers: nodes.filter(el => el.getAttribute('role') === 'separator').map(el => ({
        ...box(el), background: style(el).backgroundColor, opacity: style(el).opacity,
      })),
      spacers: nodes.filter(el => el.getAttribute('aria-hidden') === 'true').map(el => {
        const parent = el.parentElement;
        const kids = parent === null ? [] : [...parent.children];
        const i = kids.indexOf(el);
        const before = i > 0 ? kids[i - 1] : null;
        const after = i >= 0 ? kids[i + 1] : null;
        return {
          ...box(el),
          flex: style(el).flex,
          measuredGapPx: before === null || after === null ? null
            : Math.round(after.getBoundingClientRect().left - before.getBoundingClientRect().right),
        };
      }),
      emptyGrids: nodes.filter(el => style(el).display === 'grid' && el.children.length === 0).length,
      unrendered: [...card.querySelectorAll('[data-openui-unrendered]')].map(el => el.getAttribute('data-openui-unrendered')),
    }, null, 1);
  })()`)

  // The verdict must carry the variable result, not just "I found a card". A card
  // that draws but references an undeclared variable is the D6/D7/D17/D18 defect,
  // and this is the line that decides the exit code.
  const problems = []
  if (report.found === false) problems.push('CARD NOT FOUND')
  if ((report.unresolved ?? []).length > 0) problems.push('UNRESOLVED VARIABLES')
  if ((report.danglingHostTokens ?? []).length > 0) problems.push('DANGLING HOST TOKENS')
  const verdict = problems.length > 0 ? problems.join(' + ') : 'CARD MEASURED'

  // Summary only, for the same reason as `tokens`: the per-element tables are
  // useful in an evidence file and noise in a transcript. The numbers that decide
  // the verdict stay on stdout.
  return {
    ...gate,
    verdict,
    found: report.found,
    copies: report.copies,
    theme: report.theme,
    cardWidth: report.cardWidth,
    unresolved: report.unresolved ?? [],
    danglingHostTokens: report.danglingHostTokens ?? [],
    counts: {
      boxes: (report.boxes ?? []).length,
      grids: (report.grids ?? []).length,
      dividers: (report.dividers ?? []).length,
      spacers: (report.spacers ?? []).length,
      emptyGrids: report.emptyGrids ?? 0,
      unrendered: (report.unrendered ?? []).length,
    },
    unrendered: report.unrendered ?? [],
    detail: {
      boxes: report.boxes,
      grids: report.grids,
      dividers: report.dividers,
      spacers: report.spacers,
      variables: report.variables,
    },
  }
}

/** Switch the host theme through its own control, then confirm it changed. */
async function theme() {
  const gate = requireSmoke()
  if (WANT !== 'dark' && WANT !== 'light') throw new Error('--want=dark|light is required')
  const label = WANT === 'dark' ? '深色' : '浅色'

  const before = await evaluate(`JSON.stringify({ dark: document.body.hasAttribute('data-ds-dark-theme'), scheme: getComputedStyle(document.body).colorScheme })`)

  // The appearance control lives in Settings -> 通用设置 -> 外观.
  const { refFor, click } = await import('./cdp.mjs')
  if (refFor(/button "设置 \[has-submenu\]"/u) !== undefined) {
    await click(refFor(/button "设置 \[has-submenu\]"/u), 'settings')
    await SLEEP(2200)
  }
  if (refFor(/通用设置/u) !== undefined) {
    await click(refFor(/通用设置/u), 'general')
    await SLEEP(1800)
  }

  const buttonRef = refFor(new RegExp(`button "${label}"`, 'u'))
  if (buttonRef === undefined) {
    throw new Blocked(`theme: the host's ${label} control is not in the accessibility tree — refusing to force the attribute, because a forced theme is not the host's theme`)
  }
  await click(buttonRef, label)
  await SLEEP(2000)

  const after = await evaluate(`JSON.stringify({ dark: document.body.hasAttribute('data-ds-dark-theme'), scheme: getComputedStyle(document.body).colorScheme })`)
  const facts = { ...gate, gate: 'theme', want: WANT, before, after }
  if (after.dark !== (WANT === 'dark')) {
    throw new Blocked(`theme: asked for ${WANT} through the host control and the host did not switch (dark=${after.dark})`)
  }
  return { ...facts, verdict: 'THEME SWITCHED' }
}

/** Check every bridged variable against the host's real token set. */
async function tokens() {
  const gate = requireSmoke()
  const report = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const card = cards[cards.length - 1];
    if (card === undefined) return JSON.stringify({ found: false });
    const s = getComputedStyle(card);
    const body = getComputedStyle(document.body);
    const out = [];
    for (let i = 0; i < s.length; i += 1) {
      const name = s[i];
      if (!name.startsWith('--')) continue;
      const value = s.getPropertyValue(name).trim();
      const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;
      out.push({
        name,
        value: value.slice(0, 50),
        hostToken,
        hostResolves: hostToken === null ? null : body.getPropertyValue(hostToken).trim() !== '',
        indirect: /var\\(--(?!dsw|dsh)/i.test(value),
      });
    }
    return JSON.stringify({ found: true, theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light', tokens: out });
  })()`)

  if (report.found === false) throw new Blocked('tokens: no card on the page to read variables from')
  const dangling = report.tokens.filter(token => token.hostResolves === false)

  // Summary only. The full table is 470 entries (~80 KB) on a real host and would
  // swamp a transcript — the exact failure this refactor exists to remove. Detail
  // goes to --out; stdout answers "do they all resolve?" with counts.
  return {
    ...gate,
    verdict: dangling.length === 0 ? 'TOKENS RESOLVE' : `${dangling.length} DANGLING TOKEN(S)`,
    theme: report.theme,
    total: report.tokens.length,
    dangling: dangling.map(token => ({ name: token.name, hostToken: token.hostToken })),
    indirect: report.tokens.filter(token => token.indirect).map(token => token.name),
    detail: { tokens: report.tokens },
  }
}

// --- entry point ------------------------------------------------------------

try {
  const result = WHAT === 'smoke' ? await smoke()
    : WHAT === 'card' ? await card()
      : WHAT === 'theme' ? await theme()
        : WHAT === 'tokens' ? await tokens()
          : null
  if (result === null) {
    console.error(`unknown --what=${WHAT}; expected smoke | card | theme | tokens`)
    process.exit(3)
  }
  summary(result)
  if (/NOT|DANGLING|FAIL/u.test(result.verdict)) process.exit(1)
  process.exit(0)
} catch (error) {
  if (error instanceof Blocked) {
    // Blocked is never a product failure. Exit 2 keeps it out of a FAIL set.
    console.error(`BLOCKED: ${error.message}`)
    summary({ verdict: 'BLOCKED', reason: error.message })
    process.exit(2)
  }
  console.error(`ERROR: ${error.message}`)
  process.exit(1)
}
