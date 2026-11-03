/**
 * Measured contrast for the 4A-2 components, in both schemes.
 *
 * This batch introduces 11px text (Badge, Code language label, marker columns)
 * and a brand-coloured Link. Small text at low contrast is the failure mode
 * upstream's own comments record ("tinted text on a light tint failed contrast at
 * 11px"), so it is measured rather than eyeballed.
 *
 * The ratio is computed against the *effective* background: the nearest ancestor
 * with a non-transparent background, which is what a reader actually sees. A
 * badge's own 16% tint sits over the card surface, so comparing its text to the
 * page background would flatter it.
 */
import { evaluate } from '../lib/cdp.mjs'

const facts = await evaluate(`(function () {
  const parse = value => {
    const m = /rgba?\\(([^)]+)\\)/.exec(value || '');
    if (m === null) return null;
    const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  // oklab(...) is what color-mix produces here; resolve it through the browser.
  const toRgb = value => {
    const probe = document.createElement('div');
    probe.style.color = value;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    return parse(rgb);
  };
  const channel = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const luminance = c => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => {
    const la = luminance(a), lb = luminance(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  };
  // Blend a translucent colour over its backdrop.
  const over = (fg, bg) => ({
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
    a: 1,
  });
  const backdropOf = el => {
    let node = el;
    let acc = null;
    while (node !== null) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c !== null && c.a > 0) { acc = acc === null ? c : over(acc, c); if (acc.a >= 1) return acc; }
      node = node.parentElement;
    }
    return acc ?? { r: 255, g: 255, b: 255, a: 1 };
  };

  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  const nodes = [...card.querySelectorAll('*')];
  const sample = (label, el) => {
    if (el === undefined) return { label, missing: true };
    const s = getComputedStyle(el);
    const fg = toRgb(s.color);
    const bg = backdropOf(el);
    return { label, text: (el.textContent || '').trim().slice(0, 24), fontSize: s.fontSize, ratio: ratio(fg, bg) };
  };
  const byText = t => nodes.find(el => (el.textContent || '').trim() === t && el.children.length === 0);
  const anchor = nodes.find(el => el.tagName === 'A');
  const badge = nodes.find(el => (el.textContent || '').trim() === 'info');
  const quote = nodes.find(el => el.tagName === 'BLOCKQUOTE');
  const pre = nodes.find(el => el.tagName === 'PRE');
  const marker = nodes.find(el => (el.getAttribute('style') || '').includes('tabular-nums'));
  const copyButton = nodes.find(el => el.tagName === 'BUTTON');

  return JSON.stringify({
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    samples: [
      sample('Link', anchor),
      sample('Badge', badge),
      sample('Quote body', quote),
      sample('Code body', pre === undefined ? undefined : pre.querySelector('code')),
      sample('Copy button', copyButton),
      sample('List marker', marker),
    ],
  });
})()`)

console.log(JSON.stringify(facts, null, 1))

// 4.5 is AA for body text below 18.66px bold / 24px regular; everything here is
// small, so 4.5 is the bar. 3.0 is the AA bar for non-text UI, which is why the
// marker glyph is judged separately rather than excused.
const failures = facts.samples.filter(sample => sample.ratio !== undefined && sample.ratio < 4.5)
if (failures.length > 0) {
  console.error(`BELOW AA 4.5:1 — ${failures.map(f => `${f.label} ${f.ratio}`).join(', ')}`)
  process.exit(1)
}
