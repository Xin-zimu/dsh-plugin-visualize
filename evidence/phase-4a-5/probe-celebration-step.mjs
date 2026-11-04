/**
 * Celebration probe — one step per invocation.
 *
 * The chained probe reported 0 confetti pieces at every sample and could not say
 * whether the verdict was 'the state never changed', 'the component never saw the
 * trigger', 'it rendered and the burst expired before the read', or 'the probe
 * looked at the wrong moment'. Those are four different findings, so each one is
 * measured separately here.
 *
 * Usage: node evidence/phase-4a-5/probe-celebration-step.mjs --step=<name>
 *   before   read pre-click state: burst count, button presence
 *   click    click Finish exactly once, then stop
 *   sample   read burst count and the subscribed state; run repeatedly by hand
 */
import { evaluate } from '../lib/cdp.mjs'

const NL = String.fromCharCode(10)
const step = (process.argv.find(arg => arg.startsWith('--step=')) ?? '--step=sample').slice(7);

const CARD = '[...document.querySelectorAll("[data-openui-card]")].pop()';

/** Everything needed to tell "no state change" from "no render" from "expired". */
const SAMPLE = `(() => {
  const card = ${CARD};
  if (!card) return JSON.stringify({ error: 'no openui card' });
  const by = (attr, kind) => [...card.querySelectorAll('[' + attr + ']')]
    .filter(e => e.getAttribute(attr) === kind).length;
  const buttons = [...card.querySelectorAll('button')]
    .map(b => (b.textContent || '').trim()).filter(Boolean);
  const finish = [...card.querySelectorAll('button')]
    .find(b => (b.textContent || '').trim() === 'Finish');
  const burst = card.querySelector('[data-openui-celebration]');
  return JSON.stringify({
    cardPath: card.getAttribute('data-openui-card'),
    buttons,
    hasFinish: !!finish,
    bursts: by('data-openui-celebration', 'burst'),
    burstNodes: card.querySelectorAll('[data-openui-celebration]').length,
    pieces: card.querySelectorAll('[data-openui-celebration] i').length,
    burstRole: burst ? burst.getAttribute('role') : null,
    burstText: burst ? (burst.textContent || '').slice(0, 40) : null,
  });
})()`;

const report = { at: new Date().toISOString(), step };

if (step === 'click') {
  report.result = await evaluate([
    '(function () {',
    `  const card = ${CARD};`,
    '  const finish = [...card.querySelectorAll("button")].find(b => (b.textContent || "").trim() === "Finish");',
    '  if (!finish) return JSON.stringify({ clicked: false, why: "no Finish button" });',
    '  finish.click();',
    '  return JSON.stringify({ clicked: true });',
    '})()',
  ].join(NL));
} else if (step === 'before' || step === 'sample') {
  report.sample = await evaluate(SAMPLE);
} else {
  console.error('unknown --step=' + step);
  process.exit(3);
}

console.log(JSON.stringify(report, null, 1));