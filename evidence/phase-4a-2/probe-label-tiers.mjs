/**
 * Which host label tier should small supporting text use?
 *
 * `HOST_TOKENS` bridges `--muted-foreground` to `--dsw-alias-label-tertiary`,
 * chosen in 4A-1 for `Caption`. 4A-2 introduces more small supporting text (the
 * copy button, the list marker column, the quote citation, the code language
 * label) and upstream used a *different* tier for those roles:
 * `--dsw-alias-label-secondary` (layout-text.css: `.iui-lt-code__copy`,
 * `.iui-lt-li__marker`, `.iui-lt-quote__cite`, `.iui-lt-li__desc`).
 *
 * So this measures both tiers against the real backdrop instead of assuming the
 * tertiary choice generalises. Ratios are computed the same way as
 * probe-contrast-4a2.mjs: effective background, WCAG 2.1 relative luminance.
 */
import { evaluate } from '../lib/cdp.mjs'

const facts = await evaluate(`(function () {
  const CANDIDATES = ['--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption', '--dsw-alias-label-primary'];
  const body = getComputedStyle(document.body);

  const parse = value => {
    const m = /rgba?\\(([^)]+)\\)/.exec(value || '');
    if (m === null) return null;
    const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
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

  // The card surface is usually TRANSPARENT: the card is mounted in the host
  // document and shows the conversation surface through it. So walk up to the
  // first ancestor that actually paints. Reading the card's own
  // backgroundColor here would yield a fully transparent colour and silently
  // compute every ratio against black — a measurement bug that would look like
  // a catastrophic contrast failure.
  const backdropOf = el => {
    let node = el;
    while (node !== null) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c !== null && c.a > 0) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  const backdrop = backdropOf(card);

  const rows = {};
  for (const name of CANDIDATES) {
    const raw = body.getPropertyValue(name).trim();
    if (raw === '') { rows[name] = { resolves: false }; continue; }
    const rgb = toRgb(raw);
    rows[name] = {
      resolves: true,
      raw: raw.slice(0, 40),
      rgb: rgb === null ? null : 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')',
      onCard: rgb === null ? null : ratio(rgb, backdrop),
    };
  }
  return JSON.stringify({
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    cardBackdrop: 'rgb(' + backdrop.r + ',' + backdrop.g + ',' + backdrop.b + ')',
    tiers: rows,
  });
})()`)

console.log(JSON.stringify(facts, null, 1))
