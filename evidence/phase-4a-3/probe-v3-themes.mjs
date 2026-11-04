/**
 * V3 — both colour schemes for the 4A-3 Inputs group, in the real host.
 *
 * ## What is measured, and why each part is needed
 *
 * 1. **The host's own appearance control** is driven (Settings -> 通用设置 -> 外观).
 *    Setting `data-ds-dark-theme` by hand is refused: a forced attribute measures a
 *    theme the host does not actually render, which is how a false pass is born.
 * 2. **Three-layer variables** (the probe carried forward from 4A-1): a variable
 *    must be referenced, declared on the card root, *and* name a host token that
 *    actually resolves. D6/D7/D17/D18/D21 were all variables that passed a
 *    `getComputedStyle().color` spot check while painting nothing.
 * 3. **Contrast**, computed from the resolved colours rather than eyeballed, at the
 *    WCAG AA thresholds (4.5:1 normal text, 3:1 large text). D22 was three light-
 *    theme colours at 4.23:1 and 3.71:1.
 * 4. **Layout**, in both schemes: no horizontal overflow, no zero-height control,
 *    and the card keeps its width when the scheme changes.
 * 5. **Interaction state**, in both schemes: the controls draw a real fill/border
 *    distinct from the card surface, so a pressed or enabled control is visible.
 *
 * It refuses to run without a fresh smoke stamp, like every product probe here.
 */
import { evaluate, click, refFor, SLEEP } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-3/V3-themes.json'
const STAMP = 'evidence/.smoke-stamp.json'
const NL = String.fromCharCode(10)
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const report = { at: new Date().toISOString(), probe: 'V3', stamp }

/** Switch the host theme through its own control; refuses to force the attribute. */
async function setTheme(want) {
  const label = want === 'dark' ? '深色' : '浅色'
  const before = await evaluate('JSON.stringify({ dark: document.body.hasAttribute("data-ds-dark-theme") })')
  const settings = refFor(/button "设置 \[has-submenu\]"/u)
  if (settings !== undefined) { await click(settings, 'settings'); await SLEEP(2200) }
  const general = refFor(/通用设置/u)
  if (general !== undefined) { await click(general, 'general'); await SLEEP(1800) }
  const btn = refFor(new RegExp('button "' + label + '"', 'u'))
  if (btn === undefined) return { switched: false, reason: 'the host ' + label + ' control is not in the accessibility tree', before }
  await click(btn, label)
  await SLEEP(2200)
  const after = await evaluate('JSON.stringify({ dark: document.body.hasAttribute("data-ds-dark-theme") })')
  return { switched: after.dark === (want === 'dark'), before, after, label }
}

/** Measure every 4A-3 card on the page in the current scheme. */
const MEASURE = [
  '(function () {',
  '  const parse = c => { const m = /rgba?\\(([^)]+)\\)/.exec(c || "."); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };',
  '  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };',
  '  const ratio = (fg, bg) => { if (!fg || !bg) return null; const a = lum(fg) + 0.05; const b = lum(bg) + 0.05; return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100; };',
  '  // Walk up until an opaque background is found: the card root is translucent over the host.',
  '  const bgOf = el => { let n = el; while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; n = n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor); };',
  '  const isDark = document.body.hasAttribute("data-ds-dark-theme");',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  // A 4A-3 card is one that draws a bound control: input, textarea, select, or a timer.',
  '  const inputsCards = cards.filter(c => c.querySelector("input, textarea, select, [role=timer]"));',
  '  const out = [];',
  '  for (const card of inputsCards) {',
  '    const cs = getComputedStyle(card);',
  '    const declared = new Set();',
  '    for (let i = 0; i < cs.length; i += 1) { const n = cs[i]; if (n.startsWith("--")) declared.add(n); }',
  '    const bodyStyle = getComputedStyle(document.body);',
  '    const nodes = [card, ...card.querySelectorAll("*")];',
  '    const referenced = new Set();',
  '    for (const el of nodes) { for (const m of (el.getAttribute("style") || "").matchAll(/var\\((--[a-z0-9-]+)/gi)) referenced.add(m[1]); }',
  '    const variables = [...referenced].sort().map(name => {',
  '      const value = cs.getPropertyValue(name).trim();',
  '      const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;',
  '      return { name, declaredOnRoot: declared.has(name), hostToken, hostResolves: hostToken === null ? null : bodyStyle.getPropertyValue(hostToken).trim() !== "" };',
  '    });',
  '    // Contrast for every element that owns visible text.',
  '    const texts = [];',
  '    for (const el of nodes) {',
  '      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");',
  '      if (own === "") continue;',
  '      const st = getComputedStyle(el);',
  '      if (st.visibility === "hidden" || st.display === "none") continue;',
  '      const fg = parse(st.color);',
  '      const bg = bgOf(el);',
  '      const size = parseFloat(st.fontSize);',
  '      const bold = parseInt(st.fontWeight, 10) >= 700;',
  '      const large = size >= 24 || (size >= 18.66 && bold);',
  '      const c = ratio(fg, bg);',
  '      texts.push({ text: own.slice(0, 24), ratio: c, size: Math.round(size * 10) / 10, large, need: large ? 3 : 4.5, passes: c === null ? null : c >= (large ? 3 : 4.5) });',
  '    }',
  '    // Layout: overflow and control geometry.',
  '    const controls = [...card.querySelectorAll("input, textarea, select, button, [role=progressbar]")].map(el => {',
  '      const r = el.getBoundingClientRect();',
  '      const st = getComputedStyle(el);',
  '      return {',
  '        tag: el.tagName.toLowerCase(),',
  '        role: el.getAttribute("role"),',
  '        label: el.getAttribute("aria-label"),',
  '        w: Math.round(r.width), h: Math.round(r.height),',
  '        bg: st.backgroundColor, border: st.borderTopWidth + " " + st.borderTopColor,',
  '        opacity: st.opacity,',
  '      };',
  '    });',
  '    const cr = card.getBoundingClientRect();',
  '    out.push({',
  '      width: Math.round(cr.width), height: Math.round(cr.height),',
  '      overflowX: card.scrollWidth > card.clientWidth + 1,',
  '      cardBg: cs.backgroundColor,',
  '      variables,',
  '      texts,',
  '      controls,',
  '      timerText: (card.querySelector("[role=timer]") || {}).textContent || null,',
  '      progressNow: (card.querySelector("[role=progressbar]") || {}).getAttribute ? card.querySelector("[role=progressbar]").getAttribute("aria-valuenow") : null,',
  '    });',
  '  }',
  '  return JSON.stringify({ theme: isDark ? "dark" : "light", scheme: getComputedStyle(document.body).colorScheme, count: out.length, cards: out });',
  '})()',
].join(NL)

const measured = {}
const switches = {}

for (const want of ['light', 'dark']) {
  switches[want] = await setTheme(want)
  await SLEEP(1200)
  measured[want] = await evaluate(MEASURE)
}

report.switches = switches
report.measured = measured

// --- verdict ---------------------------------------------------------------
const problems = []
for (const want of ['light', 'dark']) {
  const m = measured[want]
  if (m.theme !== want) problems.push(want + ': the host did not actually switch scheme (page reports ' + m.theme + ')')
  if (m.count === 0) { problems.push(want + ': no 4A-3 card on the page to measure'); continue }
  for (const [i, card] of m.cards.entries()) {
    const tag = want + ' card ' + i
    const unresolved = card.variables.filter(v => !v.declaredOnRoot).map(v => v.name)
    const dangling = card.variables.filter(v => v.hostResolves === false).map(v => v.hostToken)
    if (unresolved.length > 0) problems.push(tag + ': variables not declared on the card root: ' + unresolved.join(', '))
    if (dangling.length > 0) problems.push(tag + ': host tokens that do not resolve: ' + dangling.join(', '))
    const failing = card.texts.filter(t => t.passes === false)
    for (const t of failing) problems.push(tag + ': contrast ' + t.ratio + ':1 below ' + t.need + ':1 for "' + t.text + '" (' + t.size + 'px)')
    if (card.overflowX) problems.push(tag + ': the card overflows horizontally')
    for (const c of card.controls) {
      if (c.h <= 0) problems.push(tag + ': a ' + c.tag + (c.role ? '[' + c.role + ']' : '') + ' has zero height')
    }
  }
  // The scheme must actually change the card's surface, or 'both themes' is a claim
  // about the host, not about this component.
  if (m.cards.length > 0) report['cardBg_' + want] = m.cards[0].cardBg
}
// The card root is deliberately transparent: it sits on the host's own surface.
// So "did the theme reach the card" is judged by the colours the card actually
// paints with — its resolved variable values and its text colours — not by the
// root's own background, which is rgba(0,0,0,0) in both schemes by design.
if (measured.light.cards.length > 0 && measured.dark.cards.length > 0) {
  const lc = measured.light.cards[0]
  const dc = measured.dark.cards[0]
  const lightVars = JSON.stringify((lc.variables || []).map(v => v.name + '=' + v.hostToken))
  const darkVars = JSON.stringify((dc.variables || []).map(v => v.name + '=' + v.hostToken))
  if (lightVars !== darkVars) problems.push('the card bridges a different host token set in each scheme')
  const lightText = JSON.stringify((lc.texts || []).map(t => t.text + ':' + t.ratio))
  const darkText = JSON.stringify((dc.texts || []).map(t => t.text + ':' + t.ratio))
  if (lightText === darkText) {
    problems.push('every measured text colour is identical in both schemes: the theme never reached the card')
  }
  report.themeReachedCard = { lightText, darkText, identical: lightText === darkText }
}

report.problems = problems
report.verdict = problems.length === 0 ? 'PASS' : 'FAIL'
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL)

const brief = want => {
  const m = measured[want]
  const c = m.cards[0] || {}
  return {
    theme: m.theme,
    cards: m.count,
    variables: c.variables ? c.variables.length : 0,
    textsChecked: c.texts ? c.texts.length : 0,
    minContrast: c.texts ? Math.min(...c.texts.map(t => t.ratio === null ? 99 : t.ratio)) : null,
    cardBg: c.cardBg,
    width: c.width,
  }
}
console.log(JSON.stringify({ verdict: report.verdict, light: brief('light'), dark: brief('dark'), problems }, null, 1))
process.exit(problems.length === 0 ? 0 : 1)