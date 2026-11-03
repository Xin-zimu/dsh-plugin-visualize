/**
 * Enumerate the host's real custom properties, to check the bridge against it.
 *
 * The acceptance probe found two bridged names resolving to empty in the live
 * host: `--dsw-static-purple-500` and `--dsh-font-family-text-default`. Both have
 * fallbacks, so the card still looks right — which is exactly why this needs
 * checking rather than trusting: a fallback is a literal that cannot follow the
 * theme, and "it happens to work" is the defect class this batch exists to stop.
 *
 * This lists every custom property the host publishes on `:root` and `body`, so
 * the correct name can be chosen instead of guessed.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.style) {
          for (let i = 0; i < rule.style.length; i += 1) {
            const name = rule.style[i];
            if (name.startsWith('--')) names.add(name);
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }
  // Computed style is the authority for what is actually usable, not the sheet.
  const resolvedOn = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

  const all = [...names].sort();
  const interesting = all.filter(n => /purple|violet|font-family|static|series/i.test(n));
  return JSON.stringify({
    total: all.length,
    interesting,
    checks: {
      '--dsw-static-purple-500': {
        onRoot: resolvedOn(document.documentElement, '--dsw-static-purple-500'),
        onBody: resolvedOn(document.body, '--dsw-static-purple-500'),
      },
      '--dsh-font-family-text-default': {
        onRoot: resolvedOn(document.documentElement, '--dsh-font-family-text-default'),
        onBody: resolvedOn(document.body, '--dsh-font-family-text-default'),
      },
      '--dsw-static-deepseek-500': {
        onBody: resolvedOn(document.body, '--dsw-static-deepseek-500'),
      },
    },
    fontCandidates: all.filter(n => /font/i.test(n)),
  }, null, 1);
})()`)
console.log(JSON.stringify(report, null, 1))
