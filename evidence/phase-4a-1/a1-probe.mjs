/**
 * Stage 4A-1 acceptance probe: measure the four components as the browser
 * actually laid them out.
 *
 * Read-only. Nothing is clicked, sent, or restyled — and in particular no host
 * CSS is touched, which would invalidate the whole measurement.
 *
 * What it checks, and why each one is not obvious:
 *
 * - **CSS variables.** The three-layer check is: a variable is *referenced*, it
 *   is *declared* on the card root, and the host token it names *exists* on
 *   `document.body`. A `var()` that resolves to nothing falls back to the
 *   property's initial value, and the element looks plausible while being
 *   wrong — that is D6/D7, which survived a whole stage of unit tests.
 * - **Background and border.** Read as computed values, not as inline style
 *   strings: the question is what the element paints, not what was written.
 * - **Sizing.** `getBoundingClientRect()` against the card's own width, so
 *   "elastic" and "fixed" are measurements rather than claims.
 * - **Spacer.** The gap between the elements either side, measured, because a
 *   Spacer that collapses to zero looks identical to one that works.
 * - **Empty Grid.** A drawn-but-empty grid versus a grid whose renderer is
 *   missing — the node counts differ even when both paint nothing.
 */
import { evaluate } from './cdp.mjs'

const TAG = process.env.CARD_TITLE ?? 'A1 layout'

const report = await evaluate(`(function () {
  const TITLE = ${JSON.stringify(TAG)};
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const hits = cards.filter(c => (c.textContent || '').includes(TITLE));
  if (hits.length === 0) {
    return JSON.stringify({ found: false, cards: cards.length, titles: cards.map(c => (c.textContent || '').slice(0, 40)) });
  }

  /** Which surface a card sits on: inside the tool fold, or on the turn tail. */
  const surfaceOf = (el) => {
    let node = el;
    while (node !== null && node !== document.body) {
      if (node.matches && node.matches('[data-turn-tail], [class*=turnTail], [class*=turn-tail]')) return 'tail';
      node = node.parentElement;
    }
    return 'fold';
  };

  const card = hits[hits.length - 1];
  const surface = surfaceOf(card);

  /** Every element in the card, depth-first, with what it paints and how it measures. */
  const nodes = [...card.querySelectorAll('*')];
  const style = (el) => getComputedStyle(el);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  };

  // --- 1. CSS variable resolution, three layers -------------------------------
  const rootDeclared = new Set();
  const rootStyle = style(card);
  for (let i = 0; i < rootStyle.length; i += 1) {
    const name = rootStyle[i];
    if (name.startsWith('--')) rootDeclared.add(name);
  }
  const bodyStyle = style(document.body);
  const hostTokenExists = (token) => bodyStyle.getPropertyValue(token).trim() !== '';

  const referenced = new Map();
  for (const el of [card, ...nodes]) {
    for (const sheet of [el.getAttribute('style') || '']) {
      for (const m of sheet.matchAll(/var\\((--[a-z0-9-]+)/gi)) {
        if (!referenced.has(m[1])) referenced.set(m[1], 0);
        referenced.set(m[1], referenced.get(m[1]) + 1);
      }
    }
  }
  const variables = [...referenced.entries()].map(([name, uses]) => {
    const value = rootStyle.getPropertyValue(name).trim();
    const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;
    return {
      name, uses,
      declaredOnRoot: rootDeclared.has(name),
      value: value.slice(0, 80),
      hostToken,
      hostTokenExists: hostToken === null ? null : hostTokenExists(hostToken),
    };
  });

  // --- 2. Boxes: background, border, padding, size ----------------------------
  const boxes = nodes
    .filter(el => style(el).display === 'flex' && el.getAttribute('style')?.includes('box-sizing'))
    .map(el => {
      const s = style(el);
      return {
        text: (el.textContent || '').slice(0, 24),
        ...box(el),
        background: s.backgroundColor,
        backgroundImage: s.backgroundImage.slice(0, 60),
        borderTop: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
        borderStyle: s.borderTopStyle,
        borderWidth: s.borderTopWidth,
        borderRadius: s.borderTopLeftRadius,
        padding: s.padding,
        flex: s.flex,
        flexDirection: s.flexDirection,
        overflow: s.overflow,
        boxSizing: s.boxSizing,
      };
    });

  // --- 3. Grids ---------------------------------------------------------------
  const grids = nodes
    .filter(el => style(el).display === 'grid')
    .map(el => {
      const s = style(el);
      return {
        ...box(el),
        template: s.gridTemplateColumns,
        columnCount: s.gridTemplateColumns.split(' ').filter(Boolean).length,
        gap: s.gap,
        itemCount: el.children.length,
        items: [...el.children].map(child => {
          const cs = style(child);
          return { ...box(child), text: (child.textContent || '').slice(0, 16), display: cs.display };
        }),
      };
    });

  // --- 4. Divider -------------------------------------------------------------
  const dividers = nodes
    .filter(el => el.getAttribute('role') === 'separator')
    .map(el => {
      const s = style(el);
      return {
        ...box(el),
        background: s.backgroundColor,
        height: s.height,
        width: s.width,
        opacity: s.opacity,
        visibility: s.visibility,
      };
    });

  // --- 5. Spacer and the measured distance it creates -------------------------
  const spacers = nodes
    .filter(el => el.getAttribute('aria-hidden') === 'true')
    .map(el => {
      const s = style(el);
      const parent = el.parentElement;
      const siblings = parent === null ? [] : [...parent.children];
      const index = siblings.indexOf(el);
      const before = index > 0 ? siblings[index - 1] : null;
      const after = index >= 0 ? siblings[index + 1] : null;
      const beforeText = before === null ? null : (before.textContent || '').trim();
      const afterText = after === null ? null : (after.textContent || '').trim();
      const gap = before === null || after === null ? null
        : Math.round(after.getBoundingClientRect().left - before.getBoundingClientRect().right);
      return {
        ...box(el),
        flex: s.flex,
        minWidth: s.minWidth,
        minHeight: s.minHeight,
        beforeText, afterText,
        measuredGapPx: gap,
      };
    });

  // --- 6. Empty grid vs a missing renderer -----------------------------------
  const unrendered = [...card.querySelectorAll('[data-openui-unrendered]')]
    .map(el => el.getAttribute('data-openui-unrendered'));
  const emptyGrids = grids.filter(g => g.itemCount === 0);

  // --- 7. Contrast of the text actually drawn ---------------------------------
  const luminance = (rgb) => {
    const parts = rgb.match(/[\\d.]+/g);
    if (parts === null) return null;
    const [r, g, b] = parts.slice(0, 3).map(Number).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const la = luminance(a), lb = luminance(b);
    if (la === null || lb === null) return null;
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  return JSON.stringify({
    found: true,
    surface,
    copies: hits.length,
    cardWidth: Math.round(card.getBoundingClientRect().width),
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    bodyColorScheme: style(document.body).colorScheme,
    variables,
    boxes,
    grids,
    dividers,
    spacers,
    unrendered,
    emptyGrids,
    nodeCount: nodes.length,
  }, null, 1);
})()`)

console.log(JSON.stringify(report, null, 1))
