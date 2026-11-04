/**
 * V2 — a ticking `Timer` beside a focused `Input`, measured in the real host.
 *
 * ## The claim under test (verbatim from MANIFEST.json)
 *
 *   "One card with Timer($s, 'Left') and Input($n, 'Name'). Focus the input, start
 *    the timer, type slowly for ~5 s across several ticks. Pass: focus and caret
 *    never move and no character is lost. Fail: focus jumps away, the caret
 *    resets, or input is swallowed."
 *
 * ## Why this is the riskiest item in the batch
 *
 * The countdown writes `$state` once a second, and a `$state` write re-evaluates
 * the whole program and re-renders the whole card. The `Input` is controlled:
 * `value={field.current}`. If the re-render replaces the DOM node, or writes a
 * stale value back over what the user has typed, the field loses focus or eats
 * keystrokes — the defect is intermittent and depends on the tick landing between
 * keydown and keyup, which is why it must be measured over *several* ticks.
 *
 * jsdom renders once and has no scheduler, so it cannot reproduce this. The probe
 * drives real typing through CDP while the timer ticks, and records the field's
 * node identity, focus, caret and value at every tick.
 *
 * It drives the **acceptance profile** — a separate Edge instance with its own
 * --user-data-dir — never the operator's own browser.
 */
import { firstPageTarget, connect, evaluateJson, waitFor } from './cdp-ime.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const URL_DSH = process.argv.find(a => a.startsWith('--url='))?.slice(6)
const OUT = 'evidence/phase-4a-3/V2-timer-focus.json'
if (!URL_DSH) { console.error('usage: --url=<dsh url>'); process.exit(3) }
mkdirSync(dirname(OUT), { recursive: true })

const target = await firstPageTarget()
const cdp = await connect(target.webSocketDebuggerUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

// The host URL carries a session token. Keep the shape, never the value.
const SAFE_URL = URL_DSH.replace(/token=[^&]+/u, 'token=…')
const report = { at: new Date().toISOString(), probe: 'V2', url: SAFE_URL, via: 'CDP real keystrokes during Timer ticks' }
const NL = String.fromCharCode(10)

const HELPERS = [
  'const CARDS = () => [...document.querySelectorAll(`[data-openui-card]`)];',
  'const CARD = () => { const w = CARDS().filter(c => c.querySelector(`input`)); return w[w.length - 1]; };',
  'const FIELD = () => { const c = CARD(); if (!c) return null; return [...c.querySelectorAll(`input`)].find(i => i.getAttribute(`aria-label`) === `Name`) || null; };',
  'const TEXTS = () => { const c = CARD(); if (!c) return []; return [...c.querySelectorAll(`*`)].map(e => (e.textContent || ``).trim()); };',
].join(NL)
const page = body => ['(function () {', HELPERS, body, '})()'].join(NL)

const submitComposer = async () => {
  const clicked = await evaluateJson(cdp, page([
    'const hosts = [...document.querySelectorAll("button, [role=button]")];',
    'const near = hosts.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.y > 500; });',
    'const send = near.find(b => /send|发送/i.test(b.getAttribute("aria-label") || "")) || near[near.length - 1];',
    'if (!send) return { clicked: false };',
    'const r = send.getBoundingClientRect();',
    'send.click();',
    'return { clicked: true, x: r.x + r.width / 2, y: r.y + r.height / 2 };',
  ].join(NL)))
  if (clicked.clicked) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clicked.x, y: clicked.y, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clicked.x, y: clicked.y, button: 'left', clickCount: 1 })
  }
  return clicked
}

// --- 1. fresh conversation -------------------------------------------------
await cdp.send('Page.navigate', { url: URL_DSH })
await new Promise(r => setTimeout(r, 2500))
await evaluateJson(cdp, page([
  'const btn = [...document.querySelectorAll("button")].find(b => (b.innerText || "").includes("新会话"));',
  'if (!btn) return false;',
  'btn.click();',
  'return true;',
].join(NL)))
await new Promise(r => setTimeout(r, 4000))

// --- 2. author the card ----------------------------------------------------
const PROMPT = [
  'Use the visualize tool with backend openui, title A3 V2 Timer focus. One statement per line, no explanation.',
  'State: $s = 60 and $n = "" .',
  'The program must be exactly one root = statement drawing a Col with these children in this order:',
  'a Timer bound to $s with label Left;',
  'an Input bound to $n with label Name and placeholder type a name;',
  'a Text rendering the literal prefix N= followed by @Format of $n.',
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ')

await evaluateJson(cdp, page([
  'const ed = document.querySelector("[contenteditable]");',
  'ed.focus();',
  'const r = document.createRange(); r.selectNodeContents(ed);',
  'const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);',
  'document.execCommand("delete", false, null);',
  'document.execCommand("insertText", false, ' + JSON.stringify(PROMPT) + ');',
  'return true;',
].join(NL)))
await new Promise(r => setTimeout(r, 400))
report.submit = await submitComposer()

const appeared = await waitFor(cdp, 'document.querySelectorAll("[data-openui-card]").length > 0', 60, 1000)
report.cardsAfter = await evaluateJson(cdp, 'document.querySelectorAll("[data-openui-card]").length')
if (!appeared) {
  report.verdict = 'BLOCKED — card never appeared'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
  console.log(JSON.stringify({ verdict: report.verdict, cardsAfter: report.cardsAfter, submit: report.submit }, null, 1))
  process.exit(2)
}
await new Promise(r => setTimeout(r, 4000))

// --- 3. find the timer's start control and the field -----------------------
const fixture = await evaluateJson(cdp, page([
  'const card = CARD();',
  'if (!card) return { missing: true };',
  'const f = FIELD();',
  'window.__v2field = f;',
  'const buttons = [...card.querySelectorAll("button")].map(b => ({ text: (b.innerText || "").trim().slice(0, 20), label: b.getAttribute("aria-label") }));',
  'return {',
  '  cards: CARDS().length,',
  '  hasField: !!f,',
  '  fieldDisabled: f ? f.disabled : null,',
  '  buttons,',
  '  timerText: (card.querySelector("[role=timer]") || {}).textContent || null,',
  '  allText: TEXTS().slice(0, 12),',
  '};',
].join(NL)))
report.fixture = fixture
if (fixture.missing || fixture.hasField !== true) {
  report.verdict = 'BLOCKED — the V2 card or its Input was not found'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
  console.log(JSON.stringify({ verdict: report.verdict, fixture }, null, 1))
  process.exit(2)
}

// --- 4. focus the field, start the timer ----------------------------------
const started = await evaluateJson(cdp, page([
  'const card = CARD();',
  'const f = FIELD();',
  'f.focus();',
  'const btn = [...card.querySelectorAll("button")].find(b => (b.innerText || "").trim() === "Start");',
  'if (!btn) return { started: false, candidates: [...card.querySelectorAll("button")].map(b => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 20)) };',
  'btn.click();',
  'f.focus();',
  'return { started: true, focused: document.activeElement === f };',
].join(NL)))
report.timerStart = started

// --- 5. type across several ticks, sampling at each step -------------------
// Each character is a separate real key event, spread over ~6 seconds, so several
// one-second ticks land *between* keystrokes — the exact interleaving that would
// expose a re-render eating input.
const samples = []
const sample = async label => {
  const s = await evaluateJson(cdp, page([
    'const f = FIELD();',
    'if (!f) return { missing: true };',
    'const all = TEXTS();',
    'return {',
    '  value: f.value,',
    '  focused: document.activeElement === f,',
    '  caret: f.selectionStart,',
    '  sameNode: window.__v2field === f,',
    '  timer: (CARD().querySelector("[role=timer]") || {}).textContent || null,',
    '  stateText: all.find(t => t.startsWith("N=")) || null,',
  '};',
  ].join(NL)))
  samples.push({ label, ...s })
  return s
}

await new Promise(r => setTimeout(r, 600))
const before = await sample('before-typing')

const WORD = 'ABCDEF'
for (const ch of WORD) {
  await cdp.send('Input.insertText', { text: ch })
  await new Promise(r => setTimeout(r, 900))
  await sample('typed-' + ch)
}
await new Promise(r => setTimeout(r, 1500))
const after = await sample('after')
report.samples = samples
report.word = WORD

// --- 6. verdict ------------------------------------------------------------
const problems = []
if (started.started !== true) problems.push('the timer start control was not found: ' + JSON.stringify(started.candidates || []))

// The timer must actually have ticked, or the test proves nothing.
const timerValues = samples.map(s => s.timer).filter(v => v !== null)
const distinct = [...new Set(timerValues)]
const ticked = distinct.length >= 2
report.timerTicked = ticked
report.distinctTimerValues = distinct
if (!ticked) problems.push('the Timer never changed value across the run: no tick occurred, so focus was never under re-render pressure')

// Focus must never leave the field.
const lostFocus = samples.filter(s => s.focused !== true).map(s => s.label)
if (lostFocus.length > 0) problems.push('focus left the field at: ' + lostFocus.join(', '))

// The node must not be replaced by a re-render.
const remounted = samples.filter(s => s.sameNode === false).map(s => s.label)
if (remounted.length > 0) problems.push('the input node was replaced during a tick at: ' + remounted.join(', '))

// No character may be lost or duplicated, and order must hold.
if (after.value !== WORD) problems.push('characters lost or reordered: expected "' + WORD + '", field holds "' + after.value + '"')

// The caret must advance with the text, never reset behind it.
const carets = samples.filter(s => String(s.label).startsWith('typed-')).map(s => s.caret)
for (let i = 1; i < carets.length; i += 1) {
  if (carets[i] < carets[i - 1]) problems.push('caret jumped backwards across a tick: ' + JSON.stringify(carets))
}
if (carets.length > 0 && carets[carets.length - 1] !== WORD.length) problems.push('caret did not end at the end of the text: ' + JSON.stringify(carets))

// $state must agree with the field.
if (!String(after.stateText || '').includes(WORD)) problems.push('$state does not hold the typed text: "' + after.stateText + '"')

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
console.log(JSON.stringify({
  verdict: report.verdict,
  timerTicked: ticked,
  timerValues: distinct,
  typed: after.value,
  focusedThroughout: lostFocus.length === 0,
  sameNodeThroughout: remounted.length === 0,
  carets,
  stateText: after.stateText,
  problems,
}, null, 1))
cdp.close()
process.exit(problems.length === 0 ? 0 : 1)