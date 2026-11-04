/**
 * P4 probe — one step per invocation, no chained interaction.
 *
 * The first attempt at this measurement ran every step inside one page script and
 * reported that an outside press did not close the panel, and that one click had
 * produced two panels. Both readings were consistent with a product defect and
 * both were consistent with a probe that never gave React a chance to render.
 * The two cannot be told apart from a single chained script, which is why this
 * file takes ONE step per run and prints what it saw.
 *
 * Usage:  node evidence/phase-4a-5/probe-p4-step.mjs --step=<name>
 *
 * Steps, in order:
 *   reset     open a fresh card and assert zero panels
 *   open      click the trigger exactly once, then stop
 *   count     read panel counts (after React has rendered)
 *   outside   one real click outside the panel, then stop
 *   count2    read panel counts again
 *   state     dump the DOM evidence for the report
 */
import { evaluate } from '../lib/cdp.mjs'

const NL = String.fromCharCode(10)
const step = (process.argv.find(arg => arg.startsWith('--step=')) ?? '--step=state').slice(7);

/** The card is the last openui card on the page. */
const CARD = '[...document.querySelectorAll("[data-openui-card]")].pop()';

/** Count popover nodes by their own attribute value. */
const COUNTS = `(() => {
  const card = ${CARD};
  if (!card) return JSON.stringify({ error: 'no openui card on the page' });
  const inCard = [...card.querySelectorAll('[data-openui-popover]')];
  const all = [...document.querySelectorAll('[data-openui-popover]')];
  const by = (list, kind) => list.filter(e => e.getAttribute('data-openui-popover') === kind).length;
  return JSON.stringify({
    cardPath: card.getAttribute('data-openui-card'),
    triggersInCard: by(inCard, 'trigger'),
    panelsInCard: by(inCard, 'panel'),
    panelsOnPage: by(all, 'panel'),
    panelParents: all.filter(e => e.getAttribute('data-openui-popover') === 'panel')
      .map(e => e.closest('[data-openui-card]') ? 'card' : (e.parentElement ? e.parentElement.tagName : 'none')),
    placements: inCard.filter(e => e.getAttribute('data-openui-popover') === 'panel')
      .map(e => e.getAttribute('data-openui-popover-placement')),
  });
})()`;

const report = { at: new Date().toISOString(), step };

if (step === 'reset') {
  report.result = await evaluate([
    '(function () {',
    '  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
    '  return JSON.stringify({ escaped: true });',
    '})()',
  ].join(NL));
  report.after = await evaluate(COUNTS);
} else if (step === 'open') {
  report.result = await evaluate([
    '(function () {',
    `  const card = ${CARD};`,
    '  if (!card) return JSON.stringify({ clicked: false, why: "no card" });',
    '  const triggers = [...card.querySelectorAll("[data-openui-popover]")]',
    '    .filter(e => e.getAttribute("data-openui-popover") === "trigger");',
    '  if (triggers.length === 0) return JSON.stringify({ clicked: false, why: "no trigger" });',
    '  if (triggers.length > 1) return JSON.stringify({ clicked: false, why: "more than one trigger", n: triggers.length });',
    '  triggers[0].click();',
    '  return JSON.stringify({ clicked: true, usedIndex: 0 });',
    '})()',
  ].join(NL));
} else if (step === 'count' || step === 'count2' || step === 'state') {
  report.counts = await evaluate(COUNTS);
  if (step === 'state') {
    report.details = await evaluate([
      '(function () {',
      `  const card = ${CARD};`,
      '  const panel = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "panel");',
      '  const trigger = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "trigger");',
      '  return JSON.stringify({',
      '    triggerExists: !!trigger,',
      '    triggerExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,',
      '    panelExists: !!panel,',
      '    panelParentTag: panel && panel.parentElement ? panel.parentElement.tagName : null,',
      '    panelInBody: !!(panel && panel.parentElement === document.body),',
      '  });',
      '})()',
    ].join(NL));
  }
} else if (step === 'outside') {
  // A real click on a host element that is definitely not inside a popover: the
  // composer. It dispatches the same pointerdown sequence a user press does, and
  // it reports what it hit so the evidence shows the target was really outside.
  report.result = await evaluate([
    '(function () {',
    '  const target = document.querySelector("[contenteditable=true][role=textbox]") || document.querySelector("main") || document.body;',
    '  const inPanel = !!(target.closest && target.closest("[data-openui-popover]"));',
    '  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));',
    '  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));',
    '  return JSON.stringify({ ok: true, targetTag: target.tagName, insideAnyPopover: inPanel });',
    '})()',
  ].join(NL));
} else {
  console.error('unknown --step=' + step);
  process.exit(3);
}

console.log(JSON.stringify(report, null, 1));
