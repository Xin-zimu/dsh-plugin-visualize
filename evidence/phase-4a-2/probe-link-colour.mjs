/**
 * Which host token should a `Link` use, in both schemes?
 *
 * The Link is 16px regular text, so WCAG AA requires 4.5:1 — not the 3:1 UI bar.
 * `--primary` bridges to the host's brand fill, which is designed as a *surface*
 * colour with a paired foreground; used as body text on white it measures below
 * AA. The host has other candidates — in particular the token it uses for links
 * inside its own rendered markdown — so this measures them rather than guessing.
 *
 * Same ratio method as the other contrast probes here: resolved colour against
 * the effective painted backdrop, WCAG 2.1 relative luminance.
 */
import { evaluate } from '../lib/cdp.mjs'

const CANDIDATES = [
  '--dsw-alias-brand-primary-new-colorprimary-new-color',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-link',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-font-markdown-link-font-color',
  '--dsw-alias-state-info-primary',
  '--dsw-static-deepseek-600',
  '--dsw-static-deepseek-700',
  '--dsw-static-blue-600',
  '--dsw-static-blue-700',
]

const facts = await evaluate(`(function () {
  const CANDIDATES = ${JSON.stringify(CANDIDATES)};
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
      raw: raw.slice(0, 30),
      rgb: rgb === null ? null : 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')',
      ratio: rgb === null ? null : ratio(rgb, backdrop),
    };
  }
  return JSON.stringify({
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    backdrop: 'rgb(' + backdrop.r + ',' + backdrop.g + ',' + backdrop.b + ')',
    candidates: rows,
  });
})()`)

console.log(JSON.stringify(facts, null, 1))
