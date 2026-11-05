/**
 * Stage 5 acceptance — the release-candidate checks that need a real host.
 *
 * Each step runs separately on purpose: a single script that renders, clicks and
 * reads cannot tell "the control did nothing" from "I read the DOM before React
 * painted". That ambiguity has cost real time in this project.
 *
 *   node evidence/phase-5/probe-acceptance.mjs --step=openui
 *   node evidence/phase-5/probe-acceptance.mjs --step=refused
 *   node evidence/phase-5/probe-acceptance.mjs --step=html
 *   node evidence/phase-5/probe-acceptance.mjs --step=theme
 *   node evidence/phase-5/probe-acceptance.mjs --step=state
 */
import { evaluate } from '../lib/cdp.mjs'

const NL = String.fromCharCode(10)
const step = (process.argv.find(x => x.startsWith('--step=')) ?? '--step=openui').slice(7)

/** The last card on the page, which is the one this run drew. */
const CARD = '[...document.querySelectorAll("[data-openui-card]")].pop()'

const report = { at: new Date().toISOString(), step }

if (step === 'openui') {
  report.openui = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  if (!card) return JSON.stringify({ card: false });',
    '  const text = card.innerText || "";',
    '  return JSON.stringify({',
    '    card: true,',
    '    hasTitle: text.includes("Stage 5 acceptance"),',
    '    hasCopyButton: !!card.querySelector("[data-openui-copy=button]"),',
    '    copyPayload: (card.querySelector("[data-openui-copy=payload]") || {}).textContent || null,',
    '    hasRefusedButton: !!card.querySelector("[data-openui-refused-button]"),',
    '    refusedAction: (card.querySelector("[data-openui-refused]") || {}).getAttribute',
    '      ? card.querySelector("[data-openui-refused]").getAttribute("data-openui-refused") : null,',
    '    linkCount: card.querySelectorAll("a[href^=http]").length,',
    '    linkNoopener: [...card.querySelectorAll("a[href]")].every(a => (a.getAttribute("rel") || "").includes("noopener")),',
    '    svgCount: card.querySelectorAll("svg").length,',
    '  });',
    '})()',
  ].join(NL))
} else if (step === 'refused') {
  // Press the button whose action is refused and read what the card says.
  report.refused = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  const button = card.querySelector("[data-openui-refused-button]");',
    '  if (!button) return JSON.stringify({ pressed: false, why: "no refused control" });',
    '  const beforeNotice = !!card.querySelector("[data-openui-refused-notice]");',
    '  button.click();',
    '  return JSON.stringify({ pressed: true, beforeNotice });',
    '})()',
  ].join(NL))
} else if (step === 'refused-after') {
  report.refusedAfter = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  const notice = card.querySelector("[data-openui-refused-notice]");',
    '  return JSON.stringify({',
    '    noticeVisible: !!notice,',
    '    noticeText: notice ? notice.textContent : null,',
    '    copyControl: !!card.querySelector("[data-openui-copy=button]"),',
    '  });',
    '})()',
  ].join(NL))
} else if (step === 'html') {
  report.html = await evaluate([
    '(() => {',
    '  const frames = [...document.querySelectorAll("iframe")];',
    '  return JSON.stringify({',
    '    frames: frames.length,',
    '    withSandbox: frames.filter(f => (f.getAttribute("sandbox") || "").length > 0).length,',
    '    withDataOpenui: frames.filter(f => (f.getAttribute("data-openui-card") || "").length > 0).length,',
    '  });',
    '})()',
  ].join(NL))
} else if (step === 'theme') {
  report.theme = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  const cs = () => getComputedStyle(card);',
    '  const style = cs();',
    '  return JSON.stringify({',
    '    dark: document.body.hasAttribute("data-ds-dark-theme"),',
    '    foreground: style.getPropertyValue("--foreground").trim(),',
    '    card: style.getPropertyValue("--card").trim(),',
    '    bodyBackground: getComputedStyle(document.body).backgroundColor,',
    '  });',
    '})()',
  ].join(NL))
} else if (step === 'state') {
  report.state = await evaluate([
    '(() => {',
    '  const keys = Object.keys(localStorage).filter(k => /card|openui|visualize/i.test(k));',
    '  return JSON.stringify({ keys: keys.length, sample: keys.slice(0, 6) });',
    '})()',
  ].join(NL))
} else {
  console.error('unknown step')
  process.exit(3)
}

console.log(JSON.stringify(report, null, 1))