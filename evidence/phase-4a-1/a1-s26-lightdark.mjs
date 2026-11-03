/**
 * Check that `light-dark()` actually resolves in both themes.
 *
 * `light-dark()` only picks a branch when the element's `color-scheme` allows
 * it; where it does not, the whole declaration is invalid at computed-value
 * time and the property falls back — the same silent failure as a bad `var()`.
 * `--viz-series-4` is now the only value written that way, so it is the one that
 * has to be checked by painting it, not by reading the declaration back.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (card === undefined) return JSON.stringify({ found: false });

  // Paint the token onto a throwaway element inside the card and read it back.
  const probe = document.createElement('span');
  probe.style.color = 'var(--viz-series-4)';
  card.appendChild(probe);

  const probe2 = document.createElement('span');
  probe2.style.background = 'var(--viz-series-4)';
  card.appendChild(probe2);

  const color = getComputedStyle(probe).color;
  const background = getComputedStyle(probe2).backgroundColor;
  const scheme = getComputedStyle(card).colorScheme;
  probe.remove();
  probe2.remove();

  return JSON.stringify({
    found: true,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    cardColorScheme: scheme,
    series4AsColor: color,
    series4AsBackground: background,
    valid: color !== 'rgba(0, 0, 0, 0)' && !/^(rgb\\(0, 0, 0\\)|)$/u.test(color),
  }, null, 1);
})()`)
console.log(report)
