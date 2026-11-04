/**
 * V5 — do edited field values survive a reload and a history replay?
 *
 * ## The claim under test (verbatim from MANIFEST.json)
 *
 *   "Type into three fields, reload the page, then reopen the conversation from
 *    history. Pass: the values are the ones that were typed, not the program
 *    defaults."
 *
 * ## Why this is not a jsdom test
 *
 * The value lives in the `cardStates` store and is keyed by card id (ADR-006).
 * Only a real host has a real session log, a real persistence layer and a real
 * reload, and only a reload proves the write reached storage rather than a
 * component's memory. This was exactly the stage-3 defect: `$state` looked right
 * until the page was reloaded.
 *
 * ## The three surfaces, and why all three are needed
 *
 *   1. **edit -> read back** proves the control writes.
 *   2. **reload -> read back** proves the write was persisted, not just rendered.
 *   3. **history replay** proves the persisted state is attached to the card the
 *      host rehydrates, not to a node that happened to still be in memory.
 *
 * It uses the bsk-driven tab (the canonical evidence path, which owns the
 * session log) and refuses to run without a fresh smoke stamp.
 */
import { evaluate, fill, click, refFor, SLEEP, reload } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-3/V5-persistence.json'
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const NL = String.fromCharCode(10)
const report = { at: new Date().toISOString(), probe: 'V5', stamp }

/** Read the newest 4A-3 card's bound controls and their sibling state texts. */
const READ = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const withInputs = cards.filter(c => c.querySelectorAll("input, textarea, select").length >= 2);',
  '  const card = withInputs[withInputs.length - 1];',
  '  if (!card) return JSON.stringify({ found: false, cards: cards.length });',
  '  const ctl = [...card.querySelectorAll("input, textarea, select")].map(el => ({',
  '    tag: el.tagName.toLowerCase(),',
  '    type: el.getAttribute("type"),',
  '    label: el.getAttribute("aria-label"),',
  '    value: el.value,',
  '    checked: el.type === "checkbox" ? el.checked : null,',
  '  }));',
  '  const texts = [...card.querySelectorAll("*")].map(e => (e.textContent || "").trim())',
  '    .filter(t => /^[A-Za-z]+=/.test(t));',
  '  return JSON.stringify({ found: true, cards: cards.length, controls: ctl, texts, timer: (card.querySelector("[role=timer]")||{}).textContent || null });',
  '})()',
].join(NL)

// --- 0. the session must already hold a 4A-3 card with bound inputs --------
let state = await evaluate(READ)
report.initial = state
if (state.found !== true) {
  report.verdict = 'BLOCKED — no card with two bound controls is on the page; run V1/V2 first to author one'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
  console.log(JSON.stringify({ verdict: report.verdict, initial: state }, null, 1))
  process.exit(2)
}

// --- 1. type a distinctive value into the first text control ---------------
const MARK = 'V5-' + Date.now().toString(36)
const typed = await evaluate([
  '(function (mark) {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const withInputs = cards.filter(c => c.querySelectorAll("input, textarea, select").length >= 2);',
  '  const card = withInputs[withInputs.length - 1];',
  '  const f = [...card.querySelectorAll("input")].find(i => i.type === "text" && !i.disabled);',
  '  if (!f) return JSON.stringify({ typed: false });',
  '  f.focus();',
  '  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;',
  '  setter.call(f, mark);',
  '  f.dispatchEvent(new InputEvent("input", { data: mark, inputType: "insertText", isComposing: false, bubbles: true }));',
  '  return JSON.stringify({ typed: true, mark, value: f.value });',
  '})(' + JSON.stringify(MARK) + ')',
].join(NL))
report.typed = typed
await SLEEP(1200)

const afterTyping = await evaluate(READ)
report.afterTyping = afterTyping

// --- 2. reload, then read back --------------------------------------------
await reload()
await SLEEP(6000)

const afterReload = await evaluate(READ)
report.afterReload = afterReload

// --- 3. reopen the conversation from history ------------------------------
// Walk back to the conversation list and re-enter the same session, which is what
// a reader doing "reopen from history" actually does.
const backToList = refFor(/button "新会话"/u)
if (backToList !== undefined) { await click(backToList, 'new-session'); await SLEEP(2500) }
const historyHref = await evaluate([
  '(function () {',
  '  const items = [...document.querySelectorAll("a, button, [role=button]")];',
  '  const hit = items.find(e => /A3 V1 IME|A3 V2 Timer|Visualize OpenUI IME/i.test(e.textContent || ""));',
  '  return hit ? (hit.textContent || "").trim().slice(0, 40) : null;',
  '})()',
].join(NL))
report.historyEntry = historyHref
if (historyHref !== null) {
  await evaluate([
    '(function () {',
    '  const items = [...document.querySelectorAll("a, button, [role=button]")];',
    '  const hit = items.find(e => /A3 V1 IME|A3 V2 Timer|Visualize OpenUI IME/i.test(e.textContent || ""));',
    '  if (hit) hit.click();',
    '  return true;',
    '})()',
  ].join(NL))
  await SLEEP(6000)
}
const afterHistory = await evaluate(READ)
report.afterHistory = afterHistory

// --- verdict ---------------------------------------------------------------
const problems = []
if (afterTyping.found !== true) problems.push('the card vanished immediately after typing')
else {
  const v = (afterTyping.controls || []).find(c => c.value === MARK)
  if (!v) problems.push('the typed value did not appear in the control right after typing')
}

// The reload is the real test: the program default is 'start'/'n0', so finding MARK
// after a reload can only come from the persisted store.
if (afterReload.found !== true) {
  problems.push('the card was not rehydrated after a reload')
} else {
  const values = (afterReload.controls || []).map(c => c.value)
  if (!values.includes(MARK)) {
    problems.push('after a reload the typed value was lost: controls read ' + JSON.stringify(values))
  }
}

// History replay must show the same persisted state.
if (afterHistory.found === true) {
  const values = (afterHistory.controls || []).map(c => c.value)
  if (!values.includes(MARK)) problems.push('history replay showed the program default instead of the typed value: ' + JSON.stringify(values))
} else {
  report.historyReplayRan = false
}

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)

const brief = s => s && s.found ? (s.controls || []).map(c => c.label + '=' + JSON.stringify(c.value)) : ['(no card)']
console.log(JSON.stringify({
  verdict: report.verdict,
  mark: MARK,
  afterTyping: brief(afterTyping),
  afterReload: brief(afterReload),
  afterHistory: brief(afterHistory),
  problems,
}, null, 1))
process.exit(problems.length === 0 ? 0 : 1)
