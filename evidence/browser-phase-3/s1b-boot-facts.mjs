/**
 * Stage 3 / P3-05, step 1b: why the SPA is blank.
 *
 * A blank RootWebArea after a full page load usually means boot failed, so this
 * captures the boot facts rather than guessing: whether the boot global exists,
 * whether the config request succeeded, and what the body actually holds.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const boot = window.__DSH_BOOT__;
  const root = document.getElementById('root') || document.body.firstElementChild;
  return JSON.stringify({
    url: location.href,
    hasBoot: !!boot,
    bootKeys: boot ? Object.keys(boot).slice(0, 20) : null,
    bodyHtmlHead: document.body.innerHTML.slice(0, 300),
    rootChildren: root ? root.children.length : -1,
    scripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).slice(0, 8),
  });
})()`)
console.log(JSON.stringify(facts, null, 2))
