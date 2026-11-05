/**
 * Stage 4B browser acceptance — `@CopyToClipboard`.
 *
 * jsdom cannot answer the question this file exists to answer. A mocked
 * `navigator.clipboard` returns whatever the mock was told to return, so "the copy
 * worked" in a unit test means "the mock was called". Here the clipboard is read
 * back through the same API the page used, so the assertion is about the real
 * clipboard's contents.
 *
 * Steps run one per invocation, deliberately: a single chained script cannot tell
 * "the control did nothing" from "I read the DOM before React rendered", and that
 * ambiguity cost real time earlier in this project.
 *
 *   node evidence/phase-4b/probe-clipboard.mjs --step=reset
 *   node evidence/phase-4b/probe-clipboard.mjs --step=state
 *   node evidence/phase-4b/probe-clipboard.mjs --step=click
 *   node evidence/phase-4b/probe-clipboard.mjs --step=verify
 *   node evidence/phase-4b/probe-clipboard.mjs --step=theme --want=dark
 *   node evidence/phase-4b/probe-clipboard.mjs --step=other-refused
 */
import { evaluate } from '../lib/cdp.mjs'

const NL = String.fromCharCode(10)
const step = (process.argv.find(x => x.startsWith('--step=')) ?? '--step=state').slice(7)
const want = (process.argv.find(x => x.startsWith('--want=')) ?? '--want=dark').slice(7)

const CARD = '[...document.querySelectorAll("[data-openui-card]")].pop()'

const report = { at: new Date().toISOString(), step }

if (step === 'state') {
  report.state = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  if (!card) return JSON.stringify({ card: false });',
    '  const control = card.querySelector("[data-openui-copy=control]");',
    '  const payload = card.querySelector("[data-openui-copy=payload]");',
    '  const button = card.querySelector("[data-openui-copy=button]");',
    '  const status = card.querySelector("[data-openui-copy=status]");',
    '  return JSON.stringify({',
    '    card: true,',
    '    hasControl: !!control,',
    '    hasButton: !!button,',
    '    payloadShown: payload ? payload.textContent : null,',
    '    payloadLength: payload ? payload.textContent.length : 0,',
    '    statusText: status ? status.textContent : null,',
    '    buttonLabel: button ? button.textContent : null,',
    '  });',
    '})()',
  ].join(NL));
} else if (step === 'click') {
  report.click = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  const button = card.querySelector("[data-openui-copy=button]");',
    '  if (!button) return JSON.stringify({ clicked: false, why: "no control" });',
    '  button.click();',
    '  return JSON.stringify({ clicked: true });',
    '})()',
  ].join(NL));
} else if (step === 'verify') {
  // Read the clipboard back. `readText` needs the same user activation the write
  // had, so this is done inside a click on a real element rather than on load.
  // readText() needs a user activation, so it cannot be awaited from a script that
  // nobody clicked: the promise never settles and the CDP call hangs. The read is
  // therefore split — arm a global resolver, let a real bsk click provide the
  // activation, then collect. The first attempt did it in one expression and timed
  // out after 20s, which is the harness bound doing its job.
  await evaluate([
    '(function () {',
    '  window.__clip = { done: false, value: null, error: null };',
    '  return JSON.stringify({ armed: true });',
    '})()',
  ].join(NL));
  report.armed = true;
} else if (step === 'read') {
  // Runs INSIDE a real click, so the browser counts it as a user gesture and lets
  // readText() settle. bsk evaluates this after dispatching the click's activation.
  report.read = await evaluate([
    '(async () => {',
    `  const card = ${CARD};`,
    '  const shown = card.querySelector("[data-openui-copy=payload]");',
    '  let read = null, err = null;',
    '  try { read = await navigator.clipboard.readText(); } catch (e) { err = e.name || String(e); }',
    '  const status = card.querySelector("[data-openui-copy=status]");',
    '  return JSON.stringify({',
    '    clipboard: read,',
    '    shown: shown ? shown.textContent : null,',
    '    equal: shown ? read === shown.textContent : false,',
    '    error: err,',
    '    statusText: status ? status.textContent : null,',
    '    hostComposer: (() => { const c = document.querySelector("[contenteditable=true][role=textbox]"); return c ? (c.textContent || "").slice(0, 60) : null; })(),',
    '  });',
    '})()',
  ].join(NL), 8);
} else if (step === 'theme') {
  report.theme = await evaluate([
    '(() => {',
    `  const card = ${CARD};`,
    '  const button = card.querySelector("[data-openui-copy=button]");',
    '  const payload = card.querySelector("[data-openui-copy=payload]");',
    '  const cs = el => el ? getComputedStyle(el) : null;',
    '  const b = cs(button); const p = cs(payload);',
    '  return JSON.stringify({',
    '    scheme: document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),',
    '    buttonColor: b ? b.color : null,',
    '    buttonBackground: b ? b.backgroundColor : null,',
    '    payloadColor: p ? p.color : null,',
    '    payloadBackground: p ? p.backgroundColor : null,',
    '  });',
    '})()',
  ].join(NL));
  report.wanted = want;
} else if (step === 'other-refused') {
  report.other = await evaluate([
    '(() => {',
    '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
    '  const bad = cards.filter(c => /@OpenUrl|@ToAssistant/.test(c.textContent || "") && c.querySelector("[data-openui-copy=button]"));',
    '  return JSON.stringify({ cardsOnPage: cards.length, cardsWithCopyThatShouldNotHave: bad.length });',
    '})()',
  ].join(NL));
} else {
  console.error('unknown step');
  process.exit(3);
}

console.log(JSON.stringify(report, null, 1));