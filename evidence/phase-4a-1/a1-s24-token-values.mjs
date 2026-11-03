/**
 * Read the real values of the tokens that should replace the two broken ones.
 *
 * `--dsw-font-family` and `--dsw-font-base-16-font-family` are both published;
 * which one the card should read is decided by what they resolve to, not by
 * which name looks more likely. The purple slot has no `--dsw-static-purple-500`
 * at all, so the series colour needs a different source — most likely a
 * `--dsw-static-*` that does exist, or the brand tier.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const body = getComputedStyle(document.body);
  const read = (name) => body.getPropertyValue(name).trim();
  return JSON.stringify({
    fontFamily: read('--dsw-font-family'),
    fontBase16: read('--dsw-font-base-16-font-family'),
    fontXxs: read('--dsw-font-xxs-12-font-family'),
    violet: read('--dsh-file-type-violet'),
    seriesCandidates: {
      deepseek: read('--dsw-static-deepseek-500'),
      blue: read('--dsw-static-blue-500'),
      purple500: read('--dsw-static-purple-500'),
      violetToken: read('--dsh-file-type-violet'),
      brandPrimary: read('--dsw-alias-brand-primary-new-colorprimary-new-color'),
    },
    purpleLike: Object.keys(Object.fromEntries(
      [...document.styleSheets].flatMap(sheet => {
        try { return [...sheet.cssRules]; } catch { return []; }
      }).filter(r => r.style).flatMap(r => {
        const out = [];
        for (let i = 0; i < r.style.length; i += 1) {
          const n = r.style[i];
          if (n.startsWith('--')) out.push(n);
        }
        return out;
      }).map(n => [n, true]),
    )).filter(n => /purple|magenta|violet/i.test(n)),
  }, null, 1);
})()`)
console.log(JSON.stringify(report, null, 1))
