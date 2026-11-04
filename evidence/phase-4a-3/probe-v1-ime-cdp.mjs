/**
 * V1 — IME composition in a bound `Input`, driven by genuine CDP IME events.
 *
 * ## The claim under test
 *
 * `Input` is a controlled field: `value={field.current}`, and `onChange` calls
 * `write()`, which re-evaluates the whole program and persists `$state`. During a
 * pinyin composition the browser holds a *pre-edit* region in the field and fires
 * `compositionupdate`; the text is not committed until the candidate is chosen.
 * If the component writes the DOM value back on every render, it can destroy that
 * region — the classic CJK "characters vanish while typing" defect.
 *
 * ## Why this needs a real browser in a real composition mode
 *
 * jsdom implements no composition events at all, and dispatching a synthetic
 * `CompositionEvent` from page script is equally worthless: the browser does not
 * enter composition mode, so a component that clobbers the pre-edit would still
 * look fine. This probe drives `Input.imeSetComposition` and `Input.insertText`
 * over CDP, through the browser's own input pipeline, and it *proves* composition
 * mode was real by requiring `isComposing === true` on the `input` events the page
 * actually received.
 *
 * ## What V1 passes on (verbatim from evidence/phase-4a-3/MANIFEST.json)
 *
 *   "Pass: every character lands, the candidate window is not interrupted, and a
 *    sibling Text agrees. Fail: a dropped character, a reset composition, or a
 *    caret jump."
 *
 * It drives the **acceptance profile** — a separate Edge instance with its own
 * --user-data-dir — never the operator's own browser.
 */
import { firstPageTarget, connect, evaluateJson, waitFor } from './cdp-ime.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const URL_DSH = process.argv.find(a => a.startsWith('--url='))?.slice(6)
const OUT = 'evidence/phase-4a-3/V1-ime-composition.json'
if (!URL_DSH) { console.error('usage: --url=<dsh url>'); process.exit(3) }
mkdirSync(dirname(OUT), { recursive: true })

const target = await firstPageTarget()
const cdp = await connect(target.webSocketDebuggerUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

// The host URL carries a session token. Keep the shape, never the value — the
// same rule evidence/lib/probe.mjs already applies to location.href.
const SAFE_URL = URL_DSH.replace(/token=[^&]+/u, 'token=…')
const report = { at: new Date().toISOString(), probe: 'V1', url: SAFE_URL, via: 'CDP Input.imeSetComposition + Input.insertText' }

// Page-side helpers. Page code is one expression; strings inside it use backticks
// so that CSS attribute selectors need no quote escaping at all.
const HELPERS = [
  'const CARDS = () => [...document.querySelectorAll(`[data-openui-card]`)];',
  'const CARD = () => { const w = CARDS().filter(c => c.querySelector(`input[aria-label]`)); return w[w.length - 1]; };',
  'const FIELD = () => { const c = CARD(); if (!c) return null; return [...c.querySelectorAll(`input`)].find(i => i.getAttribute(`aria-label`) === `中文输入`) || null; };',
  'const OTHER = () => { const c = CARD(); if (!c) return null; return [...c.querySelectorAll(`input`)].find(i => i.getAttribute(`aria-label`) === `其他字段`) || null; };',
  'const TEXTS = () => { const c = CARD(); if (!c) return []; return [...c.querySelectorAll(`*`)].map(e => (e.textContent || ``).trim()); };',
].join(String.fromCharCode(10))

const page = body => ['(function () {', HELPERS, body, '})()'].join(String.fromCharCode(10))

// --- 1. load the isolated DSH session, in a NEW conversation ----------------
// A fresh session matters: card state is persisted per card, so measuring in a
// session where the field was already edited would start from a stale value and
// silently pass the "pre-edit was appended" assertions for the wrong reason.
await cdp.send('Page.navigate', { url: URL_DSH })
await new Promise(r => setTimeout(r, 2500))
// Start a fresh conversation by clicking the host's own 新会话 button, so this
// measurement begins from the program's declared defaults instead of a value a
// previous run left in the persisted card state.
await evaluateJson(cdp, ['(function () {',
  '  const btn = [...document.querySelectorAll("button")].find(b => (b.innerText || "").trim().includes("新会话") || (b.innerText || "").trim().includes("新对话"));',
  '  if (!btn) return false;',
  '  btn.click();',
  '  return true;',
'})()'].join(String.fromCharCode(10)))
await new Promise(r => setTimeout(r, 4000))
report.newSessionCards = await evaluateJson(cdp, 'document.querySelectorAll("[data-openui-card]").length')
const ready = await waitFor(cdp, 'document.querySelectorAll("[data-openui-card]").length > 0 || document.querySelectorAll("[contenteditable]").length > 0', 90, 1000)
report.pageReady = ready
if (!ready) {
  report.verdict = 'BLOCKED — DSH page did not become ready in the acceptance profile'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + String.fromCharCode(10))
  console.log(JSON.stringify({ verdict: report.verdict }, null, 1))
  process.exit(2)
}

// Submit. On this host build a synthetic Enter key event does not trigger
// submission from CDP, so the probe clicks the composer's own send control.
// This is an environment fact recorded in the report, not a product defect.
async function submitComposer() {
  const clicked = await evaluateJson(cdp, ['(function () {',
    '  const ed = document.querySelector("[contenteditable]");',
    '  if (!ed) return { clicked: false, why: "no composer" };',
    '  const hosts = [...document.querySelectorAll("button, [role=button]")];',
    '  const near = hosts.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.y > 500; });',
    '  const send = near.find(b => /send|发送/i.test(b.getAttribute("aria-label") || "")) || near[near.length - 1];',
    '  if (!send) return { clicked: false, why: "no send control" };',
    '  const r = send.getBoundingClientRect();',
    '  send.click();',
    '  return { clicked: true, label: (send.getAttribute("aria-label") || send.innerText || "").slice(0, 30), x: r.x + r.width / 2, y: r.y + r.height / 2 };',
    '})()'].join(String.fromCharCode(10)))
  if (!clicked.clicked) return clicked;
  // A real mouse press as well, in case the control listens on pointer events.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clicked.x, y: clicked.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clicked.x, y: clicked.y, button: 'left', clickCount: 1 })
  return clicked;
}

// --- 2. author the card ----------------------------------------------------
const PROMPT = [
  'Use the visualize tool with backend openui, title A3 V1 IME. One statement per line, no explanation.',
  'State: $t = "start" and $n = "n0".',
  'The program must be exactly one root = statement drawing a Col with these children in this order:',
  'an Input bound to $t with label 中文输入 and placeholder type pinyin here;',
  'a Text rendering the literal prefix T= followed by @Format of $t;',
  'an Input bound to $n with label 其他字段;',
  'a Text rendering the literal prefix N= followed by @Format of $n.',
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ')

const beforeCards = await evaluateJson(cdp, 'document.querySelectorAll("[data-openui-card]").length')
await evaluateJson(cdp, page([
  'const ed = document.querySelector(' + JSON.stringify('[contenteditable]') + ');',
  'ed.focus();',
  'document.execCommand(' + JSON.stringify('insertText') + ', false, ' + JSON.stringify(PROMPT) + ');',
  'return true;',
].join(String.fromCharCode(10))))
await new Promise(r => setTimeout(r, 500))
const CR = String.fromCharCode(13)

report.submit = await submitComposer()

const appeared = await waitFor(cdp, 'document.querySelectorAll("[data-openui-card]").length > ' + beforeCards, 60, 1000)
report.cardsBefore = beforeCards
report.cardsAfter = await evaluateJson(cdp, 'document.querySelectorAll("[data-openui-card]").length')
if (!appeared) {
  report.verdict = 'BLOCKED — card never appeared'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + String.fromCharCode(10))
  console.log(JSON.stringify({ verdict: report.verdict, cardsBefore: beforeCards, cardsAfter: report.cardsAfter }, null, 1))
  process.exit(2)
}

// The turn must stop streaming, or the card is replaced under the measurement.
await new Promise(r => setTimeout(r, 3500))

// --- 3. fixture + event recorder -------------------------------------------
const fixture = await evaluateJson(cdp, page([
  'const card = CARD();',
  'if (!card) return { missing: true, totalCards: CARDS().length };',
  'const inputs = [...card.querySelectorAll(' + JSON.stringify('input') + ')];',
  'const f = FIELD();',
  'window.__v1field = f;',
  'window.__v1events = [];',
  'const rec = e => window.__v1events.push({',
  '  type: e.type,',
  '  data: e.data === undefined ? null : e.data,',
  '  isComposing: e.isComposing === undefined ? null : e.isComposing,',
  '  inputType: e.inputType === undefined ? null : e.inputType,',
  '  valueAfter: e.target && e.target.value !== undefined ? e.target.value : null,',
  '  sel: e.target && e.target.selectionStart !== undefined ? e.target.selectionStart : null,',
  '});',
  'for (const t of [' + JSON.stringify('compositionstart') + ', ' + JSON.stringify('compositionupdate') + ', ' + JSON.stringify('compositionend') + ', ' + JSON.stringify('input') + ']) { f.addEventListener(t, rec, true); }',
  'f.focus();',
  'return {',
  '  totalCards: CARDS().length,',
  '  cardsWithIme: CARDS().filter(c => c.querySelector(' + JSON.stringify('input[aria-label]') + ')).length,',
  '  inputCount: inputs.length,',
  '  labels: inputs.map(i => i.getAttribute(' + JSON.stringify('aria-label') + ')),',
  '  disabled: inputs.map(i => i.disabled),',
  '  values: inputs.map(i => i.value),',
  '};',
].join(String.fromCharCode(10))))
report.fixture = fixture
await new Promise(r => setTimeout(r, 300))

// --- 4. drive a genuine composition: n -> ni -> nih -> nihao -> 你好 --------
const SNAP = page([
  'const f = FIELD();',
  'if (!f) return { missing: true };',
  'const all = TEXTS();',
  'return {',
  '  value: f.value,',
  '  focused: document.activeElement === f,',
  '  selection: { start: f.selectionStart, end: f.selectionEnd },',
  '  stateText: all.find(t => t.startsWith(' + JSON.stringify('T=') + ')) || null,',
  '  nText: all.find(t => t.startsWith(' + JSON.stringify('N=') + ')) || null,',
  '  sameNode: window.__v1field === f,',
  '};',
].join(String.fromCharCode(10)))

const snapshots = []
async function snap(label) {
  const state = await evaluateJson(cdp, SNAP)
  snapshots.push({ label, ...state })
  return state
}

const s0 = await snap('before')
if (s0.missing) {
  report.verdict = 'BLOCKED — the IME field was not found on the card'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + String.fromCharCode(10))
  console.log(JSON.stringify({ verdict: report.verdict, fixture }, null, 1))
  process.exit(2)
}
const caretPath = [s0.selection.start]

// A keydown for the first letter is what makes a real IME begin composition.
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78, text: '', unmodifiedText: '' })

for (const text of ['n', 'ni', 'nih', 'nihao']) {
  await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  const s = await snap('composition-' + text)
  caretPath.push(s.selection.start)
}
const preCommit = await snap('pre-commit')

// Choosing the candidate commits 你好 and replaces the pre-edit.
await cdp.send('Input.insertText', { text: '你好' })
await new Promise(r => setTimeout(r, 900))
const committed = await snap('committed')
await new Promise(r => setTimeout(r, 900))
const settled = await snap('settled')
report.snapshots = snapshots
report.caretPath = caretPath

// --- 5. what the page actually received ------------------------------------
const events = JSON.parse(await evaluateJson(cdp, 'JSON.stringify(window.__v1events)'))
report.events = events

// --- 6. the untouched neighbour --------------------------------------------
const other = await evaluateJson(cdp, page([
  'const f = OTHER();',
  'const all = TEXTS();',
  'return { value: f ? f.value : null, stateText: all.find(t => t.startsWith(' + JSON.stringify('N=') + ')) || null };',
].join(String.fromCharCode(10))))
report.otherField = other

// --- 7. verdict ------------------------------------------------------------
const problems = []
if (fixture.missing) problems.push('the IME card was not found')
if (fixture.inputCount < 2) problems.push('expected 2 bound inputs, saw ' + fixture.inputCount)
if (fixture.disabled.some(d => d === true)) problems.push('a bound input rendered disabled')

// (a) composition mode was real, not a synthetic event
const compEvents = events.filter(e => String(e.type).startsWith('composition'))
const compositingInputs = events.filter(e => e.type === 'input' && e.isComposing === true)
if (compEvents.length === 0) problems.push('no composition events reached the page: the composition was not real')
if (compositingInputs.length === 0) problems.push('no input event carried isComposing=true: composition mode was never entered')

// (b) the candidate window was not interrupted: every pre-edit step landed
const seen = snapshots.filter(s => String(s.label).startsWith('composition-')).map(s => s.value)
const expectPre = ['startn', 'startni', 'startnih', 'startnihao']
if (JSON.stringify(seen) !== JSON.stringify(expectPre)) problems.push('a pre-edit step was dropped or reordered: saw ' + JSON.stringify(seen))
if (preCommit.value !== 'startnihao') problems.push('pre-edit lost before commit: "' + preCommit.value + '"')

// (c) no caret jump: the caret must advance monotonically through the pre-edit
for (let i = 1; i < caretPath.length; i += 1) {
  if (caretPath[i] < caretPath[i - 1]) problems.push('caret jumped backwards during composition: ' + JSON.stringify(caretPath))
}

// (d) focus must never leave the field
const lostFocus = snapshots.filter(s => s.focused !== true).map(s => s.label)
if (lostFocus.length > 0) problems.push('focus left the field at: ' + lostFocus.join(', '))

// (e) the node must not be remounted mid-composition: a remount kills composition
const remounted = snapshots.filter(s => s.sameNode === false).map(s => s.label)
if (remounted.length > 0) problems.push('the input node was replaced during composition at: ' + remounted.join(', '))

// (f) the commit lands exactly once and reaches $state
if (committed.value !== 'start你好') problems.push('committed value wrong: "' + committed.value + '"')
if (!String(settled.stateText || '').includes('你好')) problems.push('$state did not receive the commit: "' + settled.stateText + '"')
if (settled.value !== 'start你好') problems.push('the committed value did not stick: "' + settled.value + '"')
if (other.value !== 'n0') problems.push('an unrelated bound field changed: "' + other.value + '"')

// Recorded, not asserted: this design writes $state on every input, pre-edit
// included. That is a defect only if it disturbs the composition, which (a)-(f)
// measure directly. Kept in the report so the behaviour is on the record.
report.preEditReachedState = snapshots.filter(s => String(s.label).startsWith('composition-')).map(s => s.stateText)

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + String.fromCharCode(10))
console.log(JSON.stringify({
  verdict: report.verdict,
  compositionModeReal: compEvents.length > 0 && compositingInputs.length > 0,
  compositionEvents: compEvents.length,
  compositingInputEvents: compositingInputs.length,
  preEditSteps: seen,
  caretPath,
  commit: { field: committed.value, state: settled.stateText, focused: settled.focused },
  preEditAlsoWrittenToState: report.preEditReachedState,
  otherField: other,
  problems,
}, null, 1))
cdp.close()
process.exit(problems.length === 0 ? 0 : 1)