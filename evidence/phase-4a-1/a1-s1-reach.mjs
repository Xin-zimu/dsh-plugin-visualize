/**
 * Stage 4A-1 browser verification, step 1: reach the app and prove which build
 * the browser is running.
 *
 * The AGENTS.md §9 hash check is done outside the browser (in PowerShell, on
 * disk). What this script adds is the *page's* answer: the bundle the module
 * loader actually evaluated, read back from the page, so a stale copy served
 * from a cache cannot pass as the fresh build.
 */
import { evaluate, navigate, SLEEP } from '../browser-phase-3/cdp.mjs'

const URL = process.env.DSH_URL
if (!URL) throw new Error('set DSH_URL to the printed :3093 URL')

console.log('navigate:', JSON.stringify(await navigate(URL)).slice(0, 120))
await SLEEP(6000)

const facts = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    url: location.href.replace(/token=[^&]+/, 'token=…'),
    title: document.title,
    composer: composer !== null,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    colorScheme: getComputedStyle(document.body).colorScheme,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('facts:', JSON.stringify(facts, null, 1))
