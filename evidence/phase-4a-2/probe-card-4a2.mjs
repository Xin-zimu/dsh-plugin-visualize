/**
 * Drive one 4A-2 acceptance card through the real host and measure it.
 *
 * Usage: node evidence/phase-4a-2/probe-card-4a2.mjs --theme=light|dark
 *
 * This is a *phase script*, not a general tool: the general measurement lives in
 * evidence/lib/probe.mjs. It exists because 4A-2 has three claims that need more
 * than "a card appeared":
 *
 *   1. all seven text components draw from one real program, in both themes;
 *   2. `Link` refuses a hostile URL in the live host, not just in jsdom — a unit
 *      test proves the markup has no href, this proves the host's own DOM agrees;
 *   3. no CSS variable is unresolved and no bridged host token dangles, which is
 *      the D6/D7/D17/D18 guard and the reason `--font-mono` was measured first.
 *
 * It refuses to run without a fresh smoke stamp, for the same reason probe.mjs
 * does: a measurement taken on a dead environment is not a measurement.
 */
import { evaluate, fill, press, reload, screenshot } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const argv = process.argv.slice(2)
const argOf = (name, fallback) => {
  const hit = argv.find(item => item.startsWith(`--${name}=`))
  return hit === undefined ? fallback : hit.slice(name.length + 3)
}
const THEME = argOf('theme', 'light')
const OUT = argOf('out', `evidence/phase-4a-2/card-${THEME}.json`)

// --- the smoke gate -------------------------------------------------------
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) {
  console.error('BLOCKED: no smoke pass recorded — run --what=smoke first')
  process.exit(2)
}
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
const age = Date.now() - Date.parse(stamp.at)
if (!(age < 45 * 60 * 1000)) {
  console.error('BLOCKED: the smoke pass is stale — re-run --what=smoke')
  process.exit(2)
}

/**
 * The program, as the model must write it: openui-lang requires one statement
 * per physical line, so `root = Col([...])` cannot be spread over several lines.
 *
 * One card exercises all seven components, including one Link with a permitted
 * URL and one with a hostile one, so the policy is observable in the host's own
 * DOM rather than only in a unit test.
 */
const PROGRAM = 'root = Col([Label("A 4A-2 acceptance card"), Row([Badge("info", "info"), Badge("success", "success"), Badge("plain")]), Link("a permitted https link", "https://example.com/docs"), Link("a refused javascript link", "javascript:alert(1)"), List(["first item", "second item", "third item"], "number"), List([ListItem("Nested title", "Nested description", "check")]), Quote("The text components are the last of the Text group.", "4A-2"), Code("const seven = [Label, Badge, Link, List, ListItem, Quote, Code]", "ts")])'

/**
 * The prompt *describes* the program rather than pasting it.
 *
 * Pasting a program as text made the model rewrite it — it "improved" the layout
 * and reported doing so. Stating the requirement and letting it write the
 * openui-lang is what the previous phase settled on, and it exercises the real
 * path: the model authors a program, this build draws it.
 */
const PROMPT = [
  'Use the visualize tool with backend "openui", title "A2 text". One statement per line, no explanation.',
  'The program must be exactly one root = statement, drawing a Col with these children in this order:',
  'a Label reading A 4A-2 acceptance card;',
  'a Row of three Badges reading info, success and plain, the first two coloured info and success;',
  'a Link labelled a permitted https link pointing at https://example.com/docs;',
  'a Link labelled a refused javascript link whose url is the literal javascript:alert(1);',
  'a List of three plain items first item, second item, third item with the number marker;',
  'a List containing one ListItem titled Nested title with description Nested description and the check marker;',
  'a Quote reading The text components are the last of the Text group. cited to 4A-2;',
  'a Code block with language ts and the code const seven = [Label, Badge, Link, List, ListItem, Quote, Code].',
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ')

mkdirSync(dirname(OUT), { recursive: true })

const report = { at: new Date().toISOString(), theme: THEME, program: PROGRAM }

// --- 1. deliver the prompt (bulk fill + Enter, never per character) -------
const before = await evaluate('document.querySelectorAll("[data-openui-card]").length')
await fill('[contenteditable="true"]', PROMPT)
await press('Enter')

// --- 2. wait for a NEW card to appear ------------------------------------
let cards = before
for (let attempt = 0; attempt < 40 && cards <= before; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 750))
  cards = await evaluate('document.querySelectorAll("[data-openui-card]").length')
}
report.cardsBefore = before
report.cardsAfter = cards

if (cards <= before) {
  report.verdict = 'CARD NOT FOUND'
  writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`)
  console.log(JSON.stringify({ verdict: report.verdict, cardsBefore: before, cardsAfter: cards }, null, 1))
  process.exit(1)
}

// --- 3. measure the card --------------------------------------------------
const measured = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  const style = el => getComputedStyle(el);
  const text = el => (el.textContent || '').trim();
  const nodes = [...card.querySelectorAll('*')];
  const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };

  // Three layers, as in probe.mjs: referenced -> declared on the root -> host token resolves.
  const rootStyle = style(card);
  const declared = new Set();
  for (let i = 0; i < rootStyle.length; i += 1) { const n = rootStyle[i]; if (n.startsWith('--')) declared.add(n); }
  const bodyStyle = style(document.body);
  const referenced = new Set();
  for (const el of [card, ...nodes]) {
    for (const m of (el.getAttribute('style') || '').matchAll(/var\\((--[a-z0-9-]+)/gi)) referenced.add(m[1]);
  }
  const variables = [...referenced].sort().map(name => {
    const value = rootStyle.getPropertyValue(name).trim();
    const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;
    return {
      name, declaredOnRoot: declared.has(name), hostToken,
      hostResolves: hostToken === null ? null : bodyStyle.getPropertyValue(hostToken).trim() !== '',
      value: value.slice(0, 50),
    };
  });

  const anchors = nodes.filter(el => el.tagName === 'A').map(el => ({
    href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel'),
    text: text(el), color: style(el).color, decoration: style(el).textDecorationLine,
  }));

  const badges = nodes.filter(el => style(el).borderRadius === '9999px' && el.tagName === 'SPAN').map(el => ({
    text: text(el).slice(0, 20), ...box(el), background: style(el).backgroundColor, fontSize: style(el).fontSize,
  }));

  const blockquote = nodes.filter(el => el.tagName === 'BLOCKQUOTE').map(el => ({
    text: text(el).slice(0, 40), ...box(el),
    borderLeft: style(el).borderLeftWidth + ' ' + style(el).borderLeftColor,
  }));

  const pre = nodes.filter(el => el.tagName === 'PRE').map(el => ({
    ...box(el), fontFamily: style(el.querySelector('code') || el).fontFamily,
    whiteSpace: style(el.querySelector('code') || el).whiteSpace,
  }));

  const buttons = nodes.filter(el => el.tagName === 'BUTTON').map(el => ({ text: text(el), ...box(el) }));

  const markers = nodes.filter(el => (el.getAttribute('style') || '').includes('tabular-nums'))
    .map(el => text(el).slice(0, 6));

  return JSON.stringify({
    found: true,
    copies: cards.length,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    cardWidth: box(card).w,
    headline: text(card.querySelector('div')),
    unresolved: variables.filter(v => !v.declaredOnRoot).map(v => v.name),
    danglingHostTokens: variables.filter(v => v.hostResolves === false).map(v => v.hostToken),
    unrendered: [...card.querySelectorAll('[data-openui-unrendered]')].map(el => el.getAttribute('data-openui-unrendered')),
    anchors, badges, blockquote, pre, buttons, markers,
    counts: { nodes: nodes.length, listitems: card.querySelectorAll('[role="listitem"]').length },
    variables,
  });
})()`)

report.measured = measured

// --- 4. the assertions this phase must actually make ----------------------
const problems = []
if (measured.found !== true) problems.push('CARD NOT FOUND')
if (measured.unresolved.length > 0) problems.push(`UNRESOLVED VARIABLES: ${measured.unresolved.join(', ')}`)
if (measured.danglingHostTokens.length > 0) problems.push(`DANGLING HOST TOKENS: ${measured.danglingHostTokens.join(', ')}`)
if (measured.unrendered.length > 0) problems.push(`UNRENDERED: ${measured.unrendered.join(', ')}`)

// Link: exactly the permitted URL becomes an anchor; the hostile one must not.
const hrefs = measured.anchors.map(a => a.href)
if (!hrefs.includes('https://example.com/docs')) problems.push('the permitted link did not become an anchor')
if (hrefs.some(h => /^javascript:/i.test(String(h)))) problems.push('A HOSTILE URL BECAME AN HREF')
for (const a of measured.anchors) {
  if (a.target !== '_blank') problems.push(`anchor target is ${a.target}`)
  if (!/noreferrer/u.test(String(a.rel)) || !/noopener/u.test(String(a.rel))) problems.push(`anchor rel is ${a.rel}`)
}

// The seven components must all be visible in one card.
if (measured.badges.length < 3) problems.push(`expected 3 badges, saw ${measured.badges.length}`)
if (measured.blockquote.length !== 1) problems.push(`expected 1 blockquote, saw ${measured.blockquote.length}`)
if (measured.pre.length !== 1) problems.push(`expected 1 pre, saw ${measured.pre.length}`)
if (measured.listitems < 4) problems.push(`expected >= 4 list items, saw ${measured.listitems}`)
if (measured.buttons.length < 1) problems.push('the Code copy button is missing')

// The theme must be the one asked for: measuring "dark" on a light page is a
// silent way to report a pass that was never taken.
if (measured.theme !== THEME) problems.push(`asked for ${THEME} but the page is ${measured.theme}`)

// The mono family must be a real stack, not an empty string, and must mention a
// monospace face — the D18 failure looked identical except that it said nothing.
const mono = measured.pre[0]?.fontFamily ?? ''
if (mono === '') problems.push('the code block has no computed font family')
if (!/mono|consolas|menlo|monaco|courier|sf mono|jetbrains/iu.test(mono)) problems.push(`the code font is not monospace: ${mono}`)

report.monoFontFamily = mono
report.verdict = problems.length > 0 ? problems.join(' + ') : 'CARD MEASURED'
writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`)

// A shot per theme, so the report can be read against what a reader saw.
const shot = `evidence/phase-4a-2/card-${THEME}.png`
await screenshot(shot, { fullPage: false })
report.screenshot = shot

console.log(JSON.stringify({
  verdict: report.verdict,
  theme: measured.theme,
  cardWidth: measured.cardWidth,
  anchors: measured.anchors.map(a => ({ href: a.href, target: a.target, rel: a.rel })),
  badges: measured.badges.length,
  listitems: measured.listitems,
  blockquote: measured.blockquote.length,
  pre: measured.pre.length,
  monoFontFamily: mono.slice(0, 60),
  unresolved: measured.unresolved,
  danglingHostTokens: measured.danglingHostTokens,
  unrendered: measured.unrendered,
  detail: `${OUT}`,
}, null, 1))
process.exit(problems.length > 0 ? 1 : 0)
