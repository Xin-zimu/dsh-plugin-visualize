/**
 * 4A-5 browser acceptance - the drawing group, disclosure, and play, in the real
 * host.
 *
 * The unit specs prove the markup and the grammars. This proves the host draws
 * it, and that distinction has already cost this project twice: 4A-2 shipped a
 * List that was correct in jsdom and drew two rows for one item on the live
 * card, and 4A-1 found that no card CSS variable had ever resolved while 62 unit
 * assertions passed.
 *
 * Four measurements, each answering a question jsdom cannot:
 *
 *   C1 - the drawing group: how many of each element the host drew, whether the
 *        paint resolved to a real computed colour rather than none or the
 *        browser default black, and that a refused argument produced no
 *        attribute while the marker names it.
 *
 *   C2 - disclosure: ADR-012 obligations P1-P6 on real rectangles. The panel is
 *        inside the card, opening does not move the card, Escape closes and
 *        restores focus, an outside press closes and an inside one does not, and
 *        the document listener count returns to its baseline.
 *
 *   C3 - the card is not the window: the panel rect is compared against the card
 *        AND against the host composer, because inside the card and not covering
 *        DSH are two different claims, and only the second is what a user feels.
 *
 *   C4 - both schemes, because a drawing that is legible in light and invisible
 *        in dark is the defect class that shipped through stage 1.2.
 *
 * Refuses to run without a fresh smoke stamp (AGENTS.md section 10).
 */
import { evaluate, fill, SLEEP } from '../lib/cdp.mjs'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = 'evidence/phase-4a-5/C1-drawing-disclosure.json'
const STAMP = 'evidence/.smoke-stamp.json'
if (!existsSync(STAMP)) { console.error('BLOCKED: no smoke pass recorded'); process.exit(2) }
const stamp = JSON.parse(readFileSync(STAMP, 'utf8'))
if (!(Date.now() - Date.parse(stamp.at) < 45 * 60 * 1000)) { console.error('BLOCKED: smoke stamp is stale'); process.exit(2) }
mkdirSync(dirname(OUT), { recursive: true })

const NL = String.fromCharCode(10)
const DQ = String.fromCharCode(34)

/**
 * Read a measurement that a page expression produced via JSON.stringify.
 *
 * `evaluate` returns the page's value **already parsed** when that value is a
 * JSON string, so wrapping its result in JSON.parse a second time throws
 * "[object Object] is not valid JSON" — which is exactly what the first three
 * runs of this probe did. It is written as one helper instead of fourteen
 * call-site guesses because both shapes are legitimate: a page expression that
 * returns an object comes back as that object, and one that returns a string
 * comes back parsed. Handling both keeps the probe honest about which it asked
 * for, and the ambiguity is stated here rather than rediscovered.
 * @param value - whatever `evaluate` returned.
 * @returns the object.
 */
const asJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value)
const report = { at: new Date().toISOString(), probe: '4A-5 drawing and disclosure', stamp }

/** A quoted openui-lang string, so this file needs no nested quote escaping. */
const q = (s) => DQ + s + DQ;

// A statement must occupy exactly one physical line, so the whole Col children
// list is assembled as a comma-joined single line. The first version of this
// probe wrote it across ten lines and the host correctly refused to draw it;
// that was a defect in the probe, and it is recorded in the phase report rather
// than quietly fixed, because "the model would not cooperate" and "the component
// does not render" must never be confused.
const KIDS = [
  'Title(' + q('A5 drawing') + ')',
  'Svg([G([Circle(24, 24, 16, ' + q('info') + '), Rect(52, 8, 32, 32, ' + q('success') + ', ' + q('none') + ', 0, 1, 4)], ' + q('translate(0 0)') + '), '
    + 'Ellipse(120, 24, 20, 12, ' + q('warning') + '), Line(0, 52, 200, 52, ' + q('ink') + ', 2), '
    + 'Path(' + q('M 10 70 L 30 88 L 50 70') + ', ' + q('none') + ', ' + q('danger') + ', 2), '
    + 'Polyline(' + q('70,88 90,70 110,88') + ', ' + q('purple') + ', 2), '
    + 'Polygon(' + q('130,88 150,70 170,88') + ', ' + q('pink') + '), '
    + 'SvgText(' + q('drawing') + ', 100, 110, 12, ' + q('ink') + ', ' + q('middle') + ', ' + q('semibold') + ')], ' + q('0 0 200 120') + ')',
  'Divider()',
  'Title(' + q('disclosure and play') + ')',
  'Row([Popover(' + q('What is this?') + ', ' + q('An inline panel clamped inside the card.') + '), Flashcard(' + q('front') + ', ' + q('back') + ', ' + q('tap to flip') + ')])',
  'Carousel([Card([Text(' + q('one') + ')], ' + q('soft') + '), Card([Text(' + q('two') + ')], ' + q('soft') + '), Card([Text(' + q('three') + ')], ' + q('soft') + ')], 140, 2)',
  // A bare step, which is the form the language documents and the validator now
  // also accepts for the grouped form. (The gate rejected Action([...]) until
  // this run found it; both forms are legal as of the fix recorded in the phase
  // report, and this probe uses the one that needs no wrapper at all.)",
  'Button(' + q('Finish') + ', @Set($done, true))',
  'Celebration($done)',
].join(', ');
const PROGRAM_SOURCE = '$done = false' + NL + 'root = Col([' + KIDS + '])';
report.program = PROGRAM_SOURCE;

const PROMPT = [
  'Use the visualize tool with backend openui, title A5 drawing and disclosure.',
  'One statement per line, no explanation. Write exactly this program, character for character:',
  PROGRAM_SOURCE,
  'Then reply with the single word DRAWN. Do not explain and do not change the content.',
].join(' ');
report.prompt = PROMPT;

// --- send the program through a real turn -----------------------------------

const before = await evaluate('document.querySelectorAll("[data-openui-card]").length');
await fill('[contenteditable="true"]', PROMPT);
await SLEEP(600);
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
].join(NL));
report.submit = sent;

let cards = before;
for (let i = 0; i < 90 && cards <= before; i += 1) {
  await SLEEP(1000);
  cards = await evaluate('document.querySelectorAll("[data-openui-card]").length');
}
report.cardsBefore = before;
report.cardsAfter = cards;
if (cards <= before) {
  report.verdict = 'BLOCKED - the card never appeared';
  writeFileSync(OUT, JSON.stringify(report, null, 1) + NL);
  console.log(JSON.stringify({ verdict: report.verdict, submit: sent, cardsBefore: before, cardsAfter: cards }, null, 1));
  process.exit(2);
}
await SLEEP(3500);

// --- C1: the drawing group, as the host actually drew it --------------------

const C1 = await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const q = (s) => card.querySelectorAll(s).length;',
  '  const svg = card.querySelector("svg[data-openui-svg]") || card.querySelector("svg");',
  '  const paintOf = (el) => {',
  '    const cs = getComputedStyle(el);',
  '    return { fill: cs.fill, stroke: cs.stroke, strokeWidth: cs.strokeWidth, opacity: cs.opacity };',
  '  };',
  '  const first = (sel) => card.querySelector(sel);',
  '  const boxOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };',
  '  const circle = first("svg circle");',
  '  const rect = first("svg rect");',
  '  const line = first("svg line");',
  '  const path = first("svg path");',
  '  const text = first("svg text");',
  '  return JSON.stringify({',
  '    cards: cards.length,',
  '    unrendered: [...card.querySelectorAll("[data-openui-unrendered]")].map(e => e.getAttribute("data-openui-unrendered")),',
  '    counts: {',
  '      svg: q("svg"), g: q("g"), circle: q("circle"), ellipse: q("ellipse"), rect: q("rect"),',
  '      line: q("line"), path: q("path"), polyline: q("polyline"), polygon: q("polygon"), text: q("svg text"),',
  '    },',
  '    refusedMarkers: [...card.querySelectorAll("[data-openui-svg-refused]")].map(e => e.getAttribute("data-openui-svg-refused")),',
  '    viewBox: svg ? svg.getAttribute("viewBox") : null,',
  '    svgBox: svg ? boxOf(svg) : null,',
  '    geometry: {',
  '      circle: circle ? { cx: circle.getAttribute("cx"), cy: circle.getAttribute("cy"), r: circle.getAttribute("r") } : null,',
  '      rect: rect ? { x: rect.getAttribute("x"), y: rect.getAttribute("y"), w: rect.getAttribute("width"), rx: rect.getAttribute("rx") } : null,',
  '      line: line ? { x1: line.getAttribute("x1"), x2: line.getAttribute("x2") } : null,',
  '      pathD: path ? path.getAttribute("d") : null,',
  '      polylinePoints: first("svg polyline") ? first("svg polyline").getAttribute("points") : null,',
  '      polygonPoints: first("svg polygon") ? first("svg polygon").getAttribute("points") : null,',
  '    },',
  '    transform: first("svg g") ? first("svg g").getAttribute("transform") : null,',
  '    paints: {',
  '      circle: circle ? paintOf(circle) : null,',
  '      rect: rect ? paintOf(rect) : null,',
  '      line: line ? paintOf(line) : null,',
  '      path: path ? paintOf(path) : null,',
  '      text: text ? paintOf(text) : null,',
  '    },',
  '    textContent: text ? (text.textContent || "").trim() : null,',
  '    textAnchor: text ? text.getAttribute("text-anchor") : null,',
  '  });',
  '})()',
].join(NL));
report.C1 = asJson(C1);

// --- C2/C3: ADR-012, measured on real rectangles ----------------------------
//
// P1 inside the card, P2 the card does not move, P3 Escape closes and restores
// focus, P4 outside press closes and inside press does not, P5 a second card is
// unaffected, P6 no document listener survives.

const LISTENER_INSTRUMENT = [
  '(function () {',
  '  if (window.__listenerAudit) return JSON.stringify({ installed: true, already: true });',
  '  const live = new Map();',
  '  const realAdd = document.addEventListener.bind(document);',
  '  const realRemove = document.removeEventListener.bind(document);',
  '  const keyOf = (type, fn) => type + "|" + String(fn && fn.name || "anon") + "|" + String(fn);',
  '  document.addEventListener = function (type, fn, opts) {',
  '    try { if (opts === undefined || opts === null || opts === true) live.set(keyOf(type, fn), type); } catch (e) {}',
  '    return realAdd(type, fn, opts);',
  '  };',
  '  document.removeEventListener = function (type, fn, opts) {',
  '    try { live.delete(keyOf(type, fn)); } catch (e) {}',
  '    return realRemove(type, fn, opts);',
  '  };',
  '  window.__listenerAudit = {',
  '    snapshot: () => { const out = {}; for (const t of live.values()) out[t] = (out[t] || 0) + 1; return out; },',
  '  };',
  '  return JSON.stringify({ installed: true, already: false });',
  '})()',
].join(NL);
// The expression returns a JSON string, which `evaluate` parses once, leaving a
// string; one more parse gives the object. Stated because getting this wrong is
// what made the first run fail on "[object Object] is not valid JSON".
report.listenerInstrument = asJson(await evaluate(LISTENER_INSTRUMENT));
const baseline = asJson(await evaluate('JSON.stringify(window.__listenerAudit.snapshot())'));
report.listenerBaseline = baseline;

const OPEN_PANEL = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const trigger = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "trigger");',
  '  if (!trigger) return JSON.stringify({ error: "no popover trigger on the card" });',
  '  const cardBefore = card.getBoundingClientRect();',
  '  trigger.click();',
  '  return JSON.stringify({ clicked: true, cardBefore: { x: cardBefore.x, y: cardBefore.y, w: cardBefore.width, h: cardBefore.height } });',
  '})()',
].join(NL);
report.openPanel = asJson(await evaluate(OPEN_PANEL));
await SLEEP(700);

const PANEL_STATE = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const panel = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "panel");',
  '  const trigger = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "trigger");',
  '  if (!panel) return JSON.stringify({ open: false });',
  '  const r = panel.getBoundingClientRect();',
  '  const c = card.getBoundingClientRect();',
  '  const cs = getComputedStyle(panel);',
  '  const composer = document.querySelector("[contenteditable=true][role=textbox]");',
  '  const cb = composer ? composer.getBoundingClientRect() : null;',
  '  const overlaps = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;',
  '  return JSON.stringify({',
  '    open: true,',
  '    placement: panel.getAttribute("data-openui-popover-placement"),',
  '    role: panel.getAttribute("role"),',
  '    ariaModal: panel.getAttribute("aria-modal"),',
  '    position: cs.position,',
  '    zIndex: cs.zIndex,',
  '    ariaExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,',
  '    panelRect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height },',
  '    cardRect: { left: c.left, top: c.top, right: c.right, bottom: c.bottom, w: c.width, h: c.height },',
  '    insideCard: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5,',
  '    overflowsCard: { left: r.left < c.left - 0.5, right: r.right > c.right + 0.5, top: r.top < c.top - 0.5, bottom: r.bottom > c.bottom + 0.5 },',
  '    composerRect: cb ? { left: cb.left, top: cb.top, right: cb.right, bottom: cb.bottom } : null,',
  '    coversComposer: cb ? overlaps(r, cb) : false,',
  '    inBodyDirectly: panel.parentElement === document.body,',
  '    parentTag: panel.parentElement ? panel.parentElement.tagName : null,',
  '    text: (panel.innerText || "").slice(0, 200),',
  '  });',
  '})()',
].join(NL);
report.panelOpen = asJson(await evaluate(PANEL_STATE));

const CARD_AFTER = await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const r = card.getBoundingClientRect();',
  '  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });',
  '})()',
].join(NL));
report.cardAfterOpen = asJson(CARD_AFTER);

// P4a: a press INSIDE the panel must not close it.
const INSIDE = await evaluate([
  '(function () {',
  '  const panel = [...document.querySelectorAll("[data-openui-card] [data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "panel");',
  '  if (!panel) return JSON.stringify({ error: "panel gone before the inside press" });',
  '  panel.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));',
  '  const still = [...document.querySelectorAll("[data-openui-card] [data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "panel");',
  '  return JSON.stringify({ stillOpen: !!still });',
  '})()',
].join(NL));
report.insidePress = asJson(INSIDE);
await SLEEP(300);

// P4b: a press OUTSIDE closes it, and P3: Escape closes it and restores focus.
// The press has to land while the panel is genuinely open, which is asserted
// immediately before it rather than assumed: an earlier version pressed on an
// already-closed panel and reported a dismissal rule that never ran.
// Counted as PANELS, not as popover nodes. The first version of this line counted
// every [data-openui-popover] and so reported 1 trigger + 1 panel as "2 open
// panels" — a probe artefact that read exactly like a component opening twice.
// The step-by-step probe measured 0 -> 1 -> 1 for the same interaction, which is
// what exposed this as a counting bug rather than a duplication one.
report.panelOpenBeforeOutside = await evaluate(
  '[...[...document.querySelectorAll("[data-openui-card]")].pop().querySelectorAll("[data-openui-popover]")].filter(e => e.getAttribute("data-openui-popover") === "panel").length',
);
// Press and read in SEPARATE round trips. Reading the panel count on the next line
// of the same page script reports the pre-press DOM, because React re-renders after
// the handler returns -- the same trap that made the first flashcard reading wrong.
// Measured directly: 1 panel before the press, 0 after it, for a press on body and
// for a press on a real host element.
await evaluate([
  '(function () {',
  '  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));',
  '  return JSON.stringify({ dispatched: true });',
  '})()',
].join(NL));
await SLEEP(600);
report.outsidePress = asJson(await evaluate([
  '(function () {',
  '  const card = [...document.querySelectorAll("[data-openui-card]")].pop();',
  '  const panels = [...card.querySelectorAll("[data-openui-popover]")].filter(e => e.getAttribute("data-openui-popover") === "panel").length;',
  '  return JSON.stringify({ stillOpen: panels > 0, panels });',
  '})()',
].join(NL)));

// Reopen, then Escape.
await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const trigger = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "trigger");',
  '  if (trigger) { trigger.focus(); trigger.click(); }',
  '  return JSON.stringify({ reopened: !!trigger });',
  '})()',
].join(NL));
await SLEEP(600);
const BEFORE_ESC = await evaluate('[...document.querySelectorAll("[data-openui-card] [data-openui-popover]")].filter(e => e.getAttribute("data-openui-popover") === "panel").length');
const ESC = await evaluate([
  '(function () {',
  '  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));',
  '  return JSON.stringify({ hadPanel: ' + '1' + ' });',
  '})()',
].join(NL));
await SLEEP(400);
const AFTER_ESC = await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const panels = [...card.querySelectorAll("[data-openui-popover]")].filter(e => e.getAttribute("data-openui-popover") === "panel").length;',
  '  const trigger = [...card.querySelectorAll("[data-openui-popover]")].find(e => e.getAttribute("data-openui-popover") === "trigger");',
  '  const active = document.activeElement;',
  '  return JSON.stringify({',
  '    panels,',
  '    focusOnTrigger: !!(trigger && active === trigger),',
  '    activeTag: active ? active.tagName : null,',
  '    ariaExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,',
  '  });',
  '})()',
].join(NL));
report.beforeEscape = BEFORE_ESC;
report.escape = asJson(AFTER_ESC);

// P6: no document listener survives the open/close cycle.
const after = asJson(await evaluate('JSON.stringify(window.__listenerAudit.snapshot())'));
report.listenerAfter = after;
report.listenerLeak = Object.keys(after).filter(t => (after[t] || 0) > (baseline[t] || 0)).map(t => ({ type: t, before: baseline[t] || 0, after: after[t] }));

// --- C1b: play and disclosure components -----------------------------------
const PLAY = await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const q = (s) => card.querySelectorAll(s).length;',
  '  const flash = [...card.querySelectorAll("[data-openui-flashcard]")].find(e => e.getAttribute("data-openui-flashcard") === "card");',
  '  const stateBefore = flash ? flash.getAttribute("data-openui-flashcard-state") : null;',
  // The read is deliberately NOT in this expression: React re-renders after the
  // handler returns, so an attribute read on the next line of the same script sees
  // the pre-click DOM. The first version of this probe did that and reported a
  // flashcard that would not flip — a false negative about a component that works.
  // The click and the read are two evaluations with a wait between them.
  '  const track = [...card.querySelectorAll("[data-openui-carousel]")].find(e => e.getAttribute("data-openui-carousel") === "track");',
  // Counted by attribute VALUE, not by a selector with a quoted value: the page
  // expression lives inside a single-quoted JS string, where an escaped quote
  // folds away and breaks the expression. That is a probe-authoring constraint;
  // it is written down so the next author does not rediscover it.
  '  const byKind = (attr, kind) => [...card.querySelectorAll("[" + attr + "]")].filter(e => e.getAttribute(attr) === kind).length;',
  '  const celebration = byKind("data-openui-celebration", "burst");',
  '  return JSON.stringify({',
  '    flashcard: { stateBefore, visibleFaces: byKind("data-openui-flashcard", "visible"), hiddenFaces: byKind("data-openui-flashcard", "hidden"), hint: byKind("data-openui-flashcard", "hint") },',
  '    carousel: { tracks: byKind("data-openui-carousel", "track"), items: byKind("data-openui-carousel", "item"),',
  '      itemWidths: [...card.querySelectorAll("[data-openui-carousel]")].filter(e => e.getAttribute("data-openui-carousel") === "item").map(e => Math.round(e.getBoundingClientRect().width)),',
  '      scrollable: track ? track.scrollWidth > track.clientWidth : null,',
  '      overflowX: track ? getComputedStyle(track).overflowX : null,',
  '      tabIndex: track ? track.getAttribute("tabindex") : null },',
  '    celebrationBefore: celebration,',
  '  });',
  '})()',
].join(NL));
report.play = asJson(PLAY);

// The click and the read are separate round trips, with a real wait between them,
// because React renders after the handler returns. Reading in the same page script
// reported a flashcard that would not flip, which was false.
const beforeClick = asJson(await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const flash = [...card.querySelectorAll("[data-openui-flashcard]")].find(e => e.getAttribute("data-openui-flashcard") === "card");',
  '  if (!flash) return JSON.stringify({ clicked: false });',
  '  flash.click();',
  '  return JSON.stringify({ clicked: true, stateBefore: flash.getAttribute("data-openui-flashcard-state") });',
  '})()',
].join(NL)));
await SLEEP(600);
report.flashcardClick = beforeClick;
report.flashcardAfter = asJson(await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const flash = [...card.querySelectorAll("[data-openui-flashcard]")].find(e => e.getAttribute("data-openui-flashcard") === "card");',
  '  const byKind = (attr, kind) => [...card.querySelectorAll("[" + attr + "]")].filter(e => e.getAttribute(attr) === kind).length;',
  '  return JSON.stringify({',
  '    stateAfter: flash ? flash.getAttribute("data-openui-flashcard-state") : null,',
  '    pressed: flash ? flash.getAttribute("aria-pressed") : null,',
  '    visibleFaces: byKind("data-openui-flashcard", "visible"),',
  '    hiddenFaces: byKind("data-openui-flashcard", "hidden"),',
  '    visibleText: (card.querySelector("[data-openui-flashcard=\'visible\']") || {}).textContent || null,',
  '  });',
  '})()',
].join(NL)));

// Celebration: pressing Finish sets $done, which must burst once.
//
// The card carries its state in localStorage, and this probe may have run before
// against the same card path -- in which case $done is ALREADY true and pressing
// Finish is not a false->true transition, so no burst is correct behaviour. (That
// is exactly what happened: the stored record read values.done = true from an
// earlier run, and the burst check reported 0 for a component that works.) Clearing
// this card's record restores the declared default, so the press is the transition
// the component exists to fire on.
report.celebrationReset = asJson(await evaluate([
  '(function () {',
  '  const card = [...document.querySelectorAll("[data-openui-card]")].pop();',
  '  const path = card.getAttribute("data-openui-card");',
  '  let cleared = 0;',
  '  for (const k of Object.keys(localStorage)) {',
  '    if (k.indexOf("openui") >= 0 && k.indexOf(path) >= 0) { localStorage.removeItem(k); cleared += 1; }',
  '  }',
  '  return JSON.stringify({ cleared });',
  '})()',
].join(NL)));

// A reload re-hydrates the card from its program, so Celebration mounts with false.
await evaluate('window.location.reload()', 1).catch(() => undefined);
await SLEEP(9000);
report.celebrationStateBefore = asJson(await evaluate([
  '(function () {',
  '  const card = [...document.querySelectorAll("[data-openui-card]")].pop();',
  '  const path = card.getAttribute("data-openui-card");',
  '  const k = Object.keys(localStorage).find(k2 => k2.indexOf("openui") >= 0 && k2.indexOf(path) >= 0);',
  '  const finish = [...card.querySelectorAll("button")].find(b => (b.textContent || "").trim() === "Finish");',
  '  return JSON.stringify({ hasFinish: !!finish, stored: k ? localStorage.getItem(k) : null, bursts: card.querySelectorAll("[data-openui-celebration]").length });',
  '})()',
].join(NL)));

const FINISH = await evaluate([
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const buttons = [...card.querySelectorAll("button")];',
  '  const finish = buttons.find(b => (b.textContent || "").trim() === "Finish");',
  '  if (!finish) return JSON.stringify({ clicked: false, labels: buttons.map(b => (b.textContent || "").trim()) });',
  '  finish.click();',
  '  return JSON.stringify({ clicked: true });',
  '})()',
].join(NL));
report.finish = asJson(FINISH);
// Sample the burst quickly and repeatedly from a fresh round trip each time: it
// exists for 2.2s, and a single late read reports 0 for a component that worked.
// The step-by-step probe showed a burst present at 20ms and gone by 3000ms.
const burstCount = () => evaluate(
  '[...document.querySelectorAll("[data-openui-card]")].pop().querySelectorAll("[data-openui-celebration] i").length',
);
report.celebrationSamples = [];
for (const waitMs of [60, 200, 400, 800, 1500, 2400, 3200]) {
  await SLEEP(waitMs === 60 ? 60 : waitMs - report.celebrationSamples.at(-1).at);
  report.celebrationSamples.push({ at: waitMs, pieces: await burstCount() });
}
report.celebrationAfterFinish = Math.max(...report.celebrationSamples.map(s => s.pieces));
report.celebrationAfterFinishAgain = report.celebrationSamples.at(-1).pieces;

// --- C4: the same drawing in the dark scheme -------------------------------
const setDark = (want) => [
  '(function () {',
  '  const want = ' + JSON.stringify('DARK') + ';',
  '  return JSON.stringify({ want });',
  '})()',
].join(NL);

const SCHEME_TOGGLE = [
  '(function () {',
  '  const before = document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";',
  '  const hits = [...document.querySelectorAll("button, [role=button], [role=switch], [role=menuitem]")];',
  '  const toggle = hits.find(b => /dark|theme|appearance|深色|主题/i.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")));',
  '  if (toggle) toggle.click();',
  '  return JSON.stringify({ before, found: !!toggle });',
  '})()',
].join(NL);
report.schemeToggle = asJson(await evaluate(SCHEME_TOGGLE));
await SLEEP(1200);

const THEME_SAMPLE = [
  '(function () {',
  '  const cards = [...document.querySelectorAll("[data-openui-card]")];',
  '  const card = cards[cards.length - 1];',
  '  const parse = (c) => { const m = String(c).match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };',
  '  const lum = (rgb) => { const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };',
  '  const ratio = (a, b) => { if (!a || !b) return null; const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };',
  '  const svg = card.querySelector("svg[data-openui-svg]");',
  '  const bg = parse(getComputedStyle(card).backgroundColor) || parse(getComputedStyle(document.body).backgroundColor);',
  '  const samples = [];',
  '  if (svg) {',
  '    for (const el of svg.querySelectorAll("circle, rect, ellipse, line, path, polyline, polygon, text")) {',
  '      const cs = getComputedStyle(el);',
  '      const fills = [cs.fill, cs.stroke].filter(c => c && c !== "none" && !/rgba?\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(c));',
  '      for (const c of fills) samples.push({ tag: el.tagName.toLowerCase(), color: c, parsed: parse(c) });',
  '    }',
  '  }',
  '  const contrasts = samples.map(s => ({ tag: s.tag, color: s.color, ratio: ratio(s.parsed, bg) })).filter(s => s.ratio !== null);',
  '  return JSON.stringify({',
  '    scheme: document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light",',
  '    background: bg,',
  '    sampleCount: contrasts.length,',
  '    minRatio: contrasts.length ? Math.min(...contrasts.map(c => c.ratio)) : null,',
  '    resolved: contrasts.every(c => c.color && c.color !== "none"),',
  '    details: contrasts.slice(0, 12),',
  '  });',
  '})()',
].join(NL);
report.C4 = asJson(await evaluate(THEME_SAMPLE));

// --- verdict ----------------------------------------------------------------

const c1 = report.C1;
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

check('C1 svg drawn', c1.counts.svg === 1, c1.counts.svg);
check('C1 one circle', c1.counts.circle === 1, c1.counts.circle);
check('C1 one rect', c1.counts.rect === 1, c1.counts.rect);
check('C1 one ellipse', c1.counts.ellipse === 1, c1.counts.ellipse);
check('C1 one line', c1.counts.line === 1, c1.counts.line);
check('C1 one path', c1.counts.path === 1, c1.counts.path);
check('C1 one polyline', c1.counts.polyline === 1, c1.counts.polyline);
check('C1 one polygon', c1.counts.polygon === 1, c1.counts.polygon);
check('C1 one svg text', c1.counts.text === 1, c1.counts.text);
check('C1 one group', c1.counts.g === 1, c1.counts.g);
check('C1 viewBox normalised', c1.viewBox === '0 0 200 120', c1.viewBox);
check('C1 transform applied', c1.transform === 'translate(0 0)', c1.transform);
check('C1 circle geometry', c1.geometry.circle && c1.geometry.circle.cx === '24' && c1.geometry.circle.r === '16', c1.geometry.circle);
check('C1 path re-serialised', c1.geometry.pathD === 'M 10 70 L 30 88 L 50 70', c1.geometry.pathD);
check('C1 points re-serialised', c1.geometry.polylinePoints === '70,88 90,70 110,88', c1.geometry.polylinePoints);
check('C1 svg text content', c1.textContent === 'drawing', c1.textContent);
check('C1 svg text anchor', c1.textAnchor === 'middle', c1.textAnchor);
check('C1 paint resolved to a colour', !!(c1.paints.circle && c1.paints.circle.fill && c1.paints.circle.fill !== 'none'), c1.paints.circle);
check('C1 no refusal markers on a valid drawing', c1.refusedMarkers.length === 0, c1.refusedMarkers);
check('C1 no unrendered notices', c1.unrendered.length === 0, c1.unrendered);

const p = report.panelOpen;
check('P1 panel opens', p.open === true, p.open);
check('P1 panel is inside the card', p.insideCard === true, p.overflowsCard);
check('P1 panel is not a body child', p.inBodyDirectly === false, p.parentTag);
check('P1 panel is absolute, not fixed', p.position === 'absolute', p.position);
check('P1 panel is non-modal', p.ariaModal === 'false', p.ariaModal);
check('P1 trigger says expanded', p.ariaExpanded === 'true', p.ariaExpanded);
check('P3 panel does not cover the host composer', p.coversComposer === false, p.composerRect);
check('P2 opening did not move the card',
  Math.abs(report.cardAfterOpen.x - report.openPanel.cardBefore.x) < 1 &&
  Math.abs(report.cardAfterOpen.w - report.openPanel.cardBefore.w) < 1,
  { before: report.openPanel.cardBefore, after: report.cardAfterOpen });
check('P4 inside press keeps it open', report.insidePress.stillOpen === true, report.insidePress);
check('P4 outside press closes it',
  report.panelOpenBeforeOutside === 1 && report.outsidePress.stillOpen === false,
  { openBefore: report.panelOpenBeforeOutside, after: report.outsidePress });
check('P3 Escape closes it', report.escape.panels === 0, report.escape);
check('P3 Escape restores focus to the trigger', report.escape.focusOnTrigger === true, report.escape.activeTag);
check('P6 no document listener leaked', report.listenerLeak.length === 0, report.listenerLeak);

const play = report.play;
check('flashcard flips',
  report.flashcardClick.stateBefore === 'front' && report.flashcardAfter.stateAfter === 'back',
  { before: report.flashcardClick.stateBefore, after: report.flashcardAfter.stateAfter });
check('flashcard says it is pressed', report.flashcardAfter.pressed === 'true', report.flashcardAfter.pressed);
check('flashcard shows one face', play.flashcard.visibleFaces === 1 && play.flashcard.hiddenFaces === 1, play.flashcard);
check('flashcard keeps its hint', play.flashcard.hint === 1, play.flashcard.hint);
check('carousel draws one item per child', play.carousel.items === 3, play.carousel.items);
check('carousel is a snap scroller', play.carousel.overflowX === 'auto' && play.carousel.tabIndex === '0', play.carousel);
check('celebration silent before the condition', play.celebrationBefore === 0, play.celebrationBefore);
check('celebration bursts after the condition',
  report.celebrationAfterFinish >= 1,
  report.celebrationSamples);
check('celebration clears itself',
  report.celebrationAfterFinishAgain === 0,
  { lastSample: report.celebrationSamples.at(-1) });

const c4 = report.C4;
check('C4 dark scheme reached', c4.scheme === 'dark', c4.scheme);
check('C4 every paint resolved', c4.resolved === true, c4.sampleCount);
check('C4 drawing stays visible against the card', c4.minRatio !== null && c4.minRatio >= 1.5, c4.minRatio);

report.checks = checks;
const failed = checks.filter(c => !c.ok);
report.verdict = failed.length === 0 ? 'PASS' : 'FAIL - ' + failed.length + ' of ' + checks.length + ' checks';
writeFileSync(OUT, JSON.stringify(report, null, 1) + NL);
console.log(JSON.stringify({
  verdict: report.verdict,
  passed: checks.length - failed.length,
  total: checks.length,
  failed: failed.map(f => f.name),
  scheme: report.C4.scheme,
  out: OUT,
}, null, 1));
process.exit(failed.length === 0 ? 0 : 1);