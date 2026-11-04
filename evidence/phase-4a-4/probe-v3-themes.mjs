// @vitest-environment jsdom
/**
 * 4A-4 V3 — both colour schemes for `Table`, `Chart`, `Icon` and `Image`.
 *
 * The batch adds a new class of small text: chart axis labels and the legend.
 * 4A-2's D22 was exactly this shape — 11px supporting text at 3.71:1 on white,
 * passing every presence assertion. So contrast is *computed* here from the
 * resolved colours rather than eyeballed, at the WCAG AA thresholds.
 *
 * The scheme is entered through the host's own Settings -> 通用设置 -> 外观
 * control, never by setting `data-ds-dark-theme`: a forced attribute measures a
 * theme the host does not actually render.
 */
import { evaluate, click, refFor, SLEEP } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-4/V3-themes.json'
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const NL = String.fromCharCode(10)
const report = { at: new Date().toISOString(), probe: '4A-4 V3', stamp }

async function setTheme(want) {
  const label = want === 'dark' ? '深色' : '浅色'
  const settings = refFor(/button "设置 \[has-submenu\]"/u)
  if (settings !== undefined) { await click(settings, 'settings'); await SLEEP(2200) }
  const general = refFor(/通用设置/u)
  if (general !== undefined) { await click(general, 'general'); await SLEEP(1800) }
  const btn = refFor(new RegExp('button "' + label + '"', 'u'))
  if (btn === undefined) return { switched: false, reason: 'no ' + label + ' control' }
  await click(btn, label)
  await SLEEP(2200)
  const after = await evaluate('JSON.stringify({ dark: document.body.hasAttribute("data-ds-dark-theme") })')
  return { switched: after.dark === (want === 'dark'), after }
}

const MEASURE = [
  '(function () {',
  '  const parse = c => { const m = /rgba?\\(([^)]+)\\)/.exec(c || "."); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };',
  '  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };',
  '  const ratio = (fg, bg) => { if (!fg || !bg) return null; const a = lum(fg) + 0.05, b = lum(bg) + 0.05; return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100; };',
  '  const bgOf = el => { let n = el; while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; n = n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor); };',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards.filter(c => c.querySelector("[data-openui-chart], [data-openui-icon], table")).pop();',
  '  if (!card) return JSON.stringify({ found: false });',
  '  const samples = [];',
  '  const consider = (el, what) => {',
  '    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");',
  '    if (own === "") return;',
  '    const st = getComputedStyle(el);',
  '    if (st.visibility === "hidden" || st.display === "none") return;',
  '    const size = parseFloat(st.fontSize);',
  '    const need = size >= 24 ? 3 : 4.5;',
  '    samples.push({ what, text: own.slice(0, 20), size: Math.round(size * 10) / 10, ratio: ratio(parse(st.color), bgOf(el)), need });',
  '  };',
  '  for (const el of card.querySelectorAll("svg text")) consider(el, "chart-axis");',
  '  for (const el of card.querySelectorAll("[data-chart-legend]")) consider(el, "chart-legend");',
  '  for (const el of card.querySelectorAll("th")) consider(el, "table-head");',
  '  for (const el of card.querySelectorAll("td")) consider(el, "table-cell");',
  '  for (const el of card.querySelectorAll("[data-openui-image]") ) consider(el, "image-refusal");',
  '  const icons = [...card.querySelectorAll("[data-openui-icon]")].map(e => ({ name: e.getAttribute("data-openui-icon"), color: getComputedStyle(e).color, bg: bgOf(e) }));',
  '  return JSON.stringify({',
  '    found: true,',
  '    theme: document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light",',
  '    samples,',
  '    icons,',
  '    counts: { table: card.querySelectorAll("table").length, charts: card.querySelectorAll("[data-openui-chart]").length, icons: card.querySelectorAll("[data-openui-icon]").length, images: card.querySelectorAll("img").length },',
  '  });',
  '})()',
].join(NL)

const measured = {}
const switches = {}
for (const want of ['light', 'dark']) {
  switches[want] = await setTheme(want)
  await SLEEP(1400)
  measured[want] = await evaluate(MEASURE)
}
report.switches = switches
report.measured = measured

const problems = []
for (const want of ['light', 'dark']) {
  const m = measured[want]
  if (m.found !== true) { problems.push(want + ': no 4A-4 card on the page'); continue }
  if (m.theme !== want) problems.push(want + ': the host did not switch scheme (page says ' + m.theme + ')')
  if (m.samples.length === 0) problems.push(want + ': no text sample was measurable')
  for (const s of m.samples) {
    if (s.ratio !== null && s.ratio < s.need) {
      problems.push(want + ': ' + s.what + ' "' + s.text + '" is ' + s.ratio + ':1, below ' + s.need + ':1 at ' + s.size + 'px')
    }
  }
  for (const icon of m.icons) {
    // An icon with no explicit colour inherits 'currentColor', which the browser
    // resolves to a real colour value. Assert that *something* resolved rather
    // than that it resolved to one particular notation.
    const resolved = String(icon.color || '').trim().toLowerCase()
    if (resolved === '' || resolved === 'currentcolor') {
      problems.push(want + ': icon ' + icon.name + ' has no resolved colour (' + JSON.stringify(icon.color) + ')')
    }
  }
}

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)

const brief = want => {
  const m = measured[want]
  const rs = (m.samples || []).map(s => s.ratio).filter(r => r !== null)
  return {
    theme: m.theme,
    samples: (m.samples || []).length,
    minContrast: rs.length ? Math.min(...rs) : null,
    kinds: [...new Set((m.samples || []).map(s => s.what))],
    counts: m.counts,
  }
}
console.log(JSON.stringify({ verdict: report.verdict, light: brief('light'), dark: brief('dark'), problems }, null, 1))
process.exit(problems.length === 0 ? 0 : 1)
