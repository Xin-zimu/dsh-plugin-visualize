/**
 * Re-verify the two token fixes in the live host, in both themes.
 *
 * The card was drawn before the fix, so this reloads and re-measures the same
 * program: `--viz-series-4` must now be a direct declaration and `--font-sans`
 * must read a token that resolves. Everything else is re-measured too, because a
 * change to the card root could affect any variable.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

console.log('reload:', JSON.stringify(await reload()).slice(0, 90))
await SLEEP(9000)

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (card === undefined) return JSON.stringify({ found: false, cards: cards.length });
  const s = getComputedStyle(card);
  const body = getComputedStyle(document.body);

  const names = ['--foreground', '--border', '--border-subtle', '--primary', '--viz-series-4', '--font-sans', '--radius'];
  const resolved = {};
  for (const name of names) {
    const value = s.getPropertyValue(name).trim();
    const hostToken = /var\\((--(?:dsw|dsh)-[a-z0-9-]+)\\)/i.exec(value)?.[1] ?? null;
    resolved[name] = {
      value: value.slice(0, 70),
      hostToken,
      hostResolves: hostToken === null ? null : body.getPropertyValue(hostToken).trim() !== '',
    };
  }
  return JSON.stringify({
    found: true,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    resolved,
    series4: s.getPropertyValue('--viz-series-4').trim(),
  }, null, 1);
})()`)
console.log(report)
