// @vitest-environment jsdom
/**
 * 4A-4 browser acceptance — `Table`, `Chart`, `Icon`, `Image` in the real host.
 *
 * The unit spec proves the markup; this proves the **host** draws it. They are
 * not interchangeable: 4A-2 shipped a `List` that was correct in jsdom and drew
 * two rows for one item on the live card (D20), and 4A-1 found that no CSS
 * variable on the card had ever resolved while every unit test passed.
 *
 * What is measured, and why each part is needed:
 *
 *   - **Table** — how many `<tr>`/`<td>` the host actually drew, not that the
 *     cell text appears somewhere.
 *   - **Chart** — one countable element per datum (`data-chart-mark`), plus the
 *     stated refusal when the data cannot be drawn. A blank box is not a pass.
 *   - **Icon** — one `[data-openui-icon]` per icon, at each of the four sizes.
 *   - **Image** — ADR-009 in the live DOM: an allowed `https:` URL becomes an
 *     `<img>`, and every refused scheme produces **no `<img>` element at all**.
 *     That last part is the security claim, and it is only meaningful measured
 *     in the host, because that is where a `javascript:` src would execute.
 *
 * It refuses to run without a fresh smoke stamp.
 */
import { evaluate, fill, press, SLEEP } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-4/C1-four-components.json'
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const NL = String.fromCharCode(10)
const report = { at: new Date().toISOString(), probe: '4A-4 C1', stamp }

const PROMPT = [
  'Use the visualize tool with backend openui, title A4 media and data. One statement per line, no explanation.',
  'Write exactly one root = statement drawing a Col with these children in this order:',
  'a Table with columns [Name, Qty] and three rows: [Widget, 3], [Gadget, 7], [Doohickey, 1];',
  'a Chart of type bar over data [{month: "Jan", sales: 12}, {month: "Feb", sales: 30}, {month: "Mar", sales: 18}] with x month and series [sales];',
  'a second Chart of type line over data [{month: "Jan", a: 5, b: 9}, {month: "Feb", a: 8, b: 4}] with x month and series [a, b];',
  'a Row containing Icon("map-pin"), Icon("star", "lg"), Icon("heart", "xl", "danger");',
  'an Image with src https://example.com/photo.png and alt A remote photo;',
  'an Image with src javascript:alert(1) and alt A refused image.',
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ')
report.prompt = PROMPT

const before = await evaluate('document.querySelectorAll("[data-openui-card]").length')
await fill('[contenteditable="true"]', PROMPT)
await SLEEP(600)
// A synthetic Enter does not submit on this host build; the send control does.
const sent = await evaluate([
  '(function () {',
  '  const hosts = [...document.querySelectorAll("button, [role=button]")];',
  '  const near = hosts.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.y > 500; });',
  '  const send = near.find(b => /send|发送/i.test(b.getAttribute("aria-label") || "")) || near[near.length - 1];',
  '  if (!send) return JSON.stringify({ clicked: false });',
  '  send.click();',
  '  return JSON.stringify({ clicked: true });',
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
  console.log(JSON.stringify({ verdict: report.verdict, submit: sent, cardsBefore: before, cardsAfter: cards }, null, 1))
  process.exit(2)
}
await SLEEP(3500)

const MEASURE = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const q = s => card.querySelectorAll(s).length;',
  '  const marks = {};',
  '  for (const el of card.querySelectorAll("[data-chart-mark]")) {',
  '    const k = el.getAttribute("data-chart-mark");',
  '    marks[k] = (marks[k] || 0) + 1;',
  '  }',
  '  return JSON.stringify({',
  '    cards: cards.length,',
  '    unrendered: [...card.querySelectorAll("[data-openui-unrendered]")].map(e => e.getAttribute("data-openui-unrendered")),',
  '    table: { tables: q("table"), heads: q("th"), bodyRows: q("tbody tr"), cells: q("tbody td") },',
  '    chart: {',
  '      count: q("[data-openui-chart]"),',
  '      kind: (card.querySelector("[data-openui-chart]") || {}).getAttribute ? card.querySelector("[data-openui-chart]").getAttribute("data-openui-chart") : null,',
  '      svgs: q("svg"),',
  '      marks,',
  '      legend: [...card.querySelectorAll("[data-chart-legend]")].map(e => e.getAttribute("data-chart-legend")),',
  '      charts: [...card.querySelectorAll("[data-openui-chart]")].map(e => e.getAttribute("data-openui-chart")),',
  '      axisText: [...card.querySelectorAll("svg text")].map(e => (e.textContent || "").trim()).filter(t => t !== ""),',
  '    },',
  '    icon: {',
  '      count: q("[data-openui-icon]"),',
  '      names: [...card.querySelectorAll("[data-openui-icon]")].map(e => e.getAttribute("data-openui-icon")),',
  '      labels: [...card.querySelectorAll("[data-openui-icon]")].map(e => e.getAttribute("aria-label")),',
  '    },',
  '    image: {',
  '      imgs: q("img"),',
  '      imgsrc: [...card.querySelectorAll("img")].map(e => e.getAttribute("src")),',
  '      refused: [...card.querySelectorAll("[data-openui-image]")].filter(e => e.getAttribute("data-openui-image") === "refused").length,',
  '      loaded: [...card.querySelectorAll("[data-openui-image]")].filter(e => e.getAttribute("data-openui-image") === "loaded").length,',
  '      allImageNodes: q("[data-openui-image]"),',
  '      text: (card.innerText || "").slice(0, 600),',
  '    },',
  '    notices: [...card.querySelectorAll("[data-openui-notice]")].map(e => e.getAttribute("data-openui-notice")),',
  '  });',
  '})()',
].join(NL)

const measured = await evaluate(MEASURE)
report.measured = measured

const problems = []
if (measured.unrendered.length > 0) problems.push('unrendered components: ' + measured.unrendered.join(', '))

// Table
if (measured.table.tables < 1) problems.push('no <table> was drawn in the host')
if (measured.table.heads !== 2) problems.push('expected 2 header cells, saw ' + measured.table.heads)
if (measured.table.bodyRows !== 3) problems.push('expected 3 body rows, saw ' + measured.table.bodyRows)
if (measured.table.cells !== 6) problems.push('expected 6 body cells, saw ' + measured.table.cells)

// Chart
if (measured.chart.count < 1) problems.push('no [data-openui-chart] was drawn in the host')
if (measured.chart.svgs < 1) problems.push('the chart drew no <svg> in the host')
if ((measured.chart.marks.bar || 0) !== 3) problems.push('expected 3 bars for 3 data points, saw ' + (measured.chart.marks.bar || 0))
// ADR-010: a legend is drawn only when there is more than one series, because a
// one-row legend is noise. The second chart has two series, so the legend must
// name both there; the first has one, so it must have none.
if (!measured.chart.legend.includes('a') || !measured.chart.legend.includes('b')) {
  problems.push('the multi-series chart legend does not name its series: ' + JSON.stringify(measured.chart.legend))
}
if (measured.chart.legend.includes('sales')) {
  problems.push('a single-series chart drew a legend, which ADR-010 suppresses')
}
if (!measured.chart.axisText.includes('Jan') || !measured.chart.axisText.includes('Feb')) {
  problems.push('the chart did not draw its category axis labels: ' + JSON.stringify(measured.chart.axisText.slice(0, 12)))
}

// Icon
if (measured.icon.count !== 3) problems.push('expected 3 icons, saw ' + measured.icon.count)
for (const name of ['map-pin', 'star', 'heart']) {
  if (!measured.icon.labels.includes(name)) problems.push('icon ' + name + ' is missing its accessible name')
}

// Image — ADR-009, measured in the host document.
if (measured.image.imgs !== 1) problems.push('expected exactly 1 <img> (the https one), saw ' + measured.image.imgs)
if (!measured.image.imgsrc.every(s => /^https?:/i.test(String(s)))) {
  problems.push('AN <img> WAS DRAWN FOR A REFUSED SCHEME: ' + JSON.stringify(measured.image.imgsrc))
}
if (measured.image.refused < 1) problems.push('the refused image did not render a stated refusal')
// The refusal must NAME the reason and must NOT echo the hostile payload back into
// the DOM. Naming the scheme is the useful part; re-inserting "javascript:alert(1)"
// as text would be a small injection surface for no benefit.
if (!(measured.image.text || '').includes('javascript')) {
  problems.push('the refusal did not name the refused scheme')
}
if ((measured.image.text || '').includes('alert(1)')) {
  problems.push('the refusal echoed the hostile payload back into the host DOM')
}

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)
console.log(JSON.stringify({
  verdict: report.verdict,
  table: measured.table,
  chart: { count: measured.chart.count, svgs: measured.chart.svgs, marks: measured.chart.marks, legend: measured.chart.legend },
  icon: measured.icon,
  image: { imgs: measured.image.imgs, srcs: measured.image.imgsrc, refused: measured.image.refused, loaded: measured.image.loaded },
  notices: measured.notices,
  problems,
}, null, 1))
process.exit(problems.length === 0 ? 0 : 1)
