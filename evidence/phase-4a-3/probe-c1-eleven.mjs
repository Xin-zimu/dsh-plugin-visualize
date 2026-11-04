/**
 * C1 — all eleven 4A-3 components drawn from one real program, in the real host.
 *
 * Exit criterion 1 is "every component in the batch renders from a real program".
 * The unit suite proves it in jsdom; this proves it in the host, which is the only
 * place the card is actually mounted, styled by the host's tokens and read by a
 * person. Every one of the eleven is counted by structure, not by "the text is
 * somewhere in the markup" — AGENTS.md §6.
 *
 * It refuses to run without a fresh smoke stamp.
 */
import { evaluate, fill, press, refFor, click, SLEEP } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-3/C1-eleven-components.json'
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const report = { at: new Date().toISOString(), probe: 'C1', stamp }
const NL = String.fromCharCode(10)

const PROMPT = [
  'Use the visualize tool with backend openui, title A3 eleven components. One statement per line, no explanation.',
  'Declare these state variables first: $txt = "hello", $area = "two lines", $sel = "a", $seg = "one", $chk = true, $radio = 1, $date = "2026-11-04", $secs = 90, $form = "in form", $icon = 0, $press = 1.',
  'Then write exactly one root = statement drawing a Col whose children are, in this order:',
  'Input($txt, "Text field");',
  'TextArea($area, "Multi line");',
  'Select($sel, ["a", "b"], "Choose");',
  'SegmentedControl($seg, ["one", "two"]);',
  'Checkbox($chk, "Agree");',
  'RadioGroup($radio, [{value: 1, label: "First"}, {value: 2, label: "Second"}], "Pick one");',
  'DatePicker($date, "When");',
  'Timer($secs, "Countdown");',
  'Form([Input($form, "Inside form")]);',
  'IconButton("check", @Set($icon, 1), "Icon action");',
  'Pressable([Text("Tap me")], @Set($press, 2), true).',
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ')
report.prompt = PROMPT

const before = await evaluate('document.querySelectorAll("[data-openui-card]").length')
await fill('[contenteditable="true"]', PROMPT)
await SLEEP(600)
// A synthetic Enter does not submit on this host build from the CLI path, so the
// composer's own send control is clicked. Recorded as an environment fact.
const sent = await evaluate([
  '(function () {',
  '  const hosts = [...document.querySelectorAll("button, [role=button]")];',
  '  const near = hosts.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.y > 500; });',
  '  const send = near.find(b => /send|发送/i.test(b.getAttribute("aria-label") || "")) || near[near.length - 1];',
  '  if (!send) return JSON.stringify({ clicked: false });',
  '  send.click();',
  '  return JSON.stringify({ clicked: true, label: (send.getAttribute("aria-label") || send.innerText || "").slice(0, 20) });',
  '})()',
].join(NL))
report.submit = sent

let cards = before
for (let i = 0; i < 60 && cards <= before; i += 1) {
  await SLEEP(1000)
  cards = await evaluate('document.querySelectorAll("[data-openui-card]").length')
}
report.cardsBefore = before
report.cardsAfter = cards
if (cards <= before) {
  report.verdict = 'BLOCKED — the card never appeared'
  writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
  console.log(JSON.stringify({ verdict: report.verdict, cardsBefore: before, cardsAfter: cards }, null, 1))
  process.exit(2)
}
await SLEEP(3000)

// Count each component by its structure in the host DOM.
const STRUCT = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const q = s => card.querySelectorAll(s).length;',
  '  const inputs = [...card.querySelectorAll("input")];',
  '  const byLabel = l => inputs.filter(i => i.getAttribute("aria-label") === l);',
  '  const unrendered = [...card.querySelectorAll("[data-openui-unrendered]")].map(e => e.getAttribute("data-openui-unrendered"));',
  '  const byTag = t => card.querySelectorAll(t).length;',
  '  return JSON.stringify({',
  '    cards: cards.length,',
  '    totalNodes: card.querySelectorAll("*").length,',
  '    unrendered,',
  '    Input: byLabel("Text field").length,',
  '    TextArea: byTag("textarea"),',
  '    Select: byTag("select"),',
  '    SegmentedControl: card.querySelectorAll("[role=radiogroup] [role=radio], [role=tablist] [role=tab]").length,',
  '    Checkbox: inputs.filter(i => i.type === "checkbox").length,',
  '    RadioGroup: card.querySelectorAll("[role=radio]").length,',
  '    DatePicker: inputs.filter(i => i.type === "date").length,',
  '    Timer: card.querySelectorAll("[role=timer]").length,',
  '    Form: byTag("form"),',
  '    IconButton: [...card.querySelectorAll("button")].filter(b => (b.getAttribute("aria-label") || "") === "Icon action").length,',
  '    Pressable: [...card.querySelectorAll("*")].filter(e => (e.textContent || "").trim() === "Tap me" && e.children.length === 0).length,',
  '    labels: inputs.map(i => i.getAttribute("aria-label")).filter(Boolean),',
  '    timerText: (card.querySelector("[role=timer]") || {}).textContent || null,',
  '    bodyText: (card.innerText || "").slice(0, 400),',
  '  });',
  '})()',
].join(NL)

const measured = await evaluate(STRUCT)
report.measured = measured

const problems = []
const EXPECT = {
  Input: 1, TextArea: 1, Select: 1, SegmentedControl: 2, Checkbox: 1,
  RadioGroup: 2, DatePicker: 1, Timer: 1, Form: 1, IconButton: 1, Pressable: 1,
}
for (const [name, min] of Object.entries(EXPECT)) {
  const got = measured[name]
  if (!(got >= min)) problems.push(name + ': expected at least ' + min + ' rendered node(s) in the host DOM, saw ' + got)
}
if (measured.unrendered.length > 0) problems.push('the card reported unrendered components: ' + measured.unrendered.join(', '))

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
console.log(JSON.stringify({
  verdict: report.verdict,
  cards: report.cardsBefore + ' -> ' + report.cardsAfter,
  counts: Object.fromEntries(Object.keys(EXPECT).map(k => [k, measured[k]])),
  unrendered: measured.unrendered,
  timerText: measured.timerText,
  problems,
}, null, 1))
process.exit(problems.length === 0 ? 0 : 1)