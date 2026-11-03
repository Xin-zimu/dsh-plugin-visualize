/**
 * Stage 3 / P3-05, step 2c: send the already-typed request.
 *
 * The prompt is in the composer and the send control is enabled, so this clicks
 * it rather than retyping: retyping would risk a duplicate submission.
 */
import { click } from './cdp.mjs'

console.log('send:', await click('button[aria-label*="发送"], button[aria-label*="Send"]', 'send'))
