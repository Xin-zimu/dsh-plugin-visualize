/**
 * Diagnose why the send button reports success while no turn starts.
 *
 * Reading state only — nothing is clicked, filled or cleared here.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const keys = Object.keys(localStorage);
  const drafts = keys.filter(k => /draft|composer|input/i.test(k)).map(k => {
    const value = localStorage.getItem(k);
    return { key: k, length: (value || '').length, head: (value || '').slice(0, 60) };
  });
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    totalKeys: keys.length,
    drafts,
    send: send === null ? null : {
      disabled: send.disabled,
      ariaDisabled: send.getAttribute('aria-disabled'),
      rect: send.getBoundingClientRect().toJSON(),
      tag: send.tagName,
      type: send.getAttribute('type'),
    },
    composer: composer === null ? null : {
      tag: composer.tagName,
      role: composer.getAttribute('role'),
      editable: composer.getAttribute('contenteditable'),
      childCount: composer.childElementCount,
      firstChildTag: composer.firstElementChild === null ? null : composer.firstElementChild.tagName,
    },
  });
})()`)
console.log(JSON.stringify(report, null, 1))
