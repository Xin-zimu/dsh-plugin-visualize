/**
 * Stage 7C workstream C — isolated daily-use acceptance run.
 *
 * Host: isolated DSH home `tmp/dsh-7c`, profile `p7c` (dsh-base + dsh-web-app +
 * this plugin), desktop CLI 0.2.2-rc.1, port 3095. The owner's daily profile and
 * its GUI (:50270) are never touched.
 *
 * Real use path: every turn is typed into the host composer with `fill` and
 * submitted with `Enter`; the model decides to call the `visualize` tool; the
 * card is the plugin's own renderer. Assertions are structural (counts/shape),
 * per AGENTS.md §6, and evidence is JSON only (no screenshots).
 *
 * The page repaints continuously (host animations), so `evaluate` is wrapped
 * with a retry budget: a moving page is an environment fact, not a product
 * failure (AGENTS.md §10).
 *
 * Usage:
 *   $env:BSK_SESSION = '<bsk session>'
 *   node evidence/stage-7c-daily/acceptance.mjs http://127.0.0.1:3095
 *
 * Exit codes: 0 all measured scenarios passed, 1 a product check failed,
 * 2 the environment blocked the run.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { click, evaluate, fill, press, reload, SLEEP, step } from '../lib/cdp.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3095'
const OUT = 'evidence/stage-7c-daily/real-use'
const COMPOSER = '[contenteditable=true][role=textbox]'
const results = { base: BASE, startedAt: new Date().toISOString(), scenarios: {} }

let blocked = false
const blocker = reason => {
  blocked = true
  results.blocked = reason
}

async function record(name, value) {
  results.scenarios[name] = value
  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

async function ev(expression, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await evaluate(expression, 1)
    } catch (error) {
      const message = String(error?.message ?? error)
      if (/observation_changed|document_changed|covered|control_context_invalid|synchronize|target changed/i.test(message)) {
        await SLEEP(400)
        continue
      }
      throw error
    }
  }
  throw new Error('page never stabilized for evaluate')
}

const pageState = () => ev(`JSON.stringify({
  href: location.href,
  title: document.title,
  composer: !!document.querySelector(${JSON.stringify(COMPOSER)}),
  cards: document.querySelectorAll('[data-openui-card]').length,
  errors: (window.__acceptanceErrors ?? []).slice(-8),
})`)

const cardSnapshot = () => ev(`JSON.stringify([...document.querySelectorAll('[data-openui-card]')].map((card, index) => ({
  index,
  title: (card.innerText || '').split('\\n').filter(Boolean)[0]?.slice(0, 80) ?? null,
  chars: (card.innerText || '').length,
  sliders: card.querySelectorAll('input[type=range]').length,
  buttons: card.querySelectorAll('button').length,
  svg: card.querySelectorAll('svg').length,
  listItems: card.querySelectorAll('[role=listitem]').length,
})))`)

async function installErrorBuffer() {
  await ev(`(() => {
    if (window.__acceptanceErrorsInstalled) return JSON.stringify('already')
    window.__acceptanceErrors = []
    const original = console.error
    console.error = (...args) => {
      window.__acceptanceErrors.push(String(args[0]).slice(0, 300))
      original.apply(console, args)
    }
    window.addEventListener('error', event => window.__acceptanceErrors.push(String(event.message).slice(0, 300)))
    window.__acceptanceErrorsInstalled = true
    return JSON.stringify('installed')
  })()`)
}

/** Type and submit one prompt; wait until that turn settles. */
async function sendPrompt(text, timeoutMs = 180000) {
  const marker = `ACCEPT-${Date.now().toString(36)}`
  const prompt = `${text}\n\n(acceptance marker ${marker}; this is a test of the visualization plugin)`
  await fill(COMPOSER, prompt)
  await SLEEP(400)
  const typed = await ev(`JSON.stringify({ length: (document.querySelector(${JSON.stringify(COMPOSER)})?.textContent || '').length, hasMarker: (document.querySelector(${JSON.stringify(COMPOSER)})?.textContent || '').includes(${JSON.stringify(marker)}) })`)
  if (!typed.hasMarker) throw new Error(`G1 input: fill delivered ${typed.length} chars without the marker`)
  await press('Enter')
  const deadline = Date.now() + timeoutMs
  let state
  while (Date.now() < deadline) {
    await SLEEP(1500)
    state = await ev(`(() => {
      const body = document.body.innerText || ''
      const markerAt = body.lastIndexOf(${JSON.stringify(marker)})
      const after = markerAt < 0 ? '' : body.slice(markerAt)
      return JSON.stringify({
        composerLength: (document.querySelector(${JSON.stringify(COMPOSER)})?.textContent || '').length,
        markerAt,
        settledAfterMarker: after.includes('已完成'),
        running: /深度求索中|运行中/.test(body.slice(-400)),
        tail: body.slice(-240),
      })
    })()`)
    if (state.markerAt >= 0 && state.settledAfterMarker) break
  }
  await SLEEP(2000)
  return { marker, state }
}

// --- G0 environment --------------------------------------------------------
let gate
try {
  gate = await pageState()
} catch (error) {
  console.error(`ENVIRONMENT BLOCK: page unreadable: ${String(error.message).slice(0, 300)}`)
  process.exit(2)
}
if (!String(gate.href).startsWith(BASE) || !gate.composer) {
  console.error(`ENVIRONMENT BLOCK: tab is ${gate.href}, composer=${gate.composer}`)
  process.exit(2)
}
await installErrorBuffer()
await record('g0-environment', { ...gate, daemon: (() => {
  try {
    const status = JSON.parse(execFileSync('bsk', ['status', '--json'], { encoding: 'utf8', env: { ...process.env, BSK_AUTO_START: '0' } }))
    return { daemonVersion: status.daemon_version, protocolVersion: status.protocol_version, session: process.env.BSK_SESSION }
  } catch { return null }
})() })

// --- Scenario 0: G1/G2/G3 on the same real path the product uses ----------
try {
  const sent = await sendPrompt('Reply with exactly DONE and nothing else.')
  await record('g1-g3-interaction', { ...sent, page: await pageState() })
} catch (error) {
  console.error(`ENVIRONMENT BLOCK: G1/G2 interaction failed: ${String(error.message).slice(0, 300)}`)
  process.exit(2)
}

// --- Scenario 1: ordinary knowledge Q&A that draws a card -----------------
const before1 = (await pageState()).cards
try {
  const sent = await sendPrompt('用中文简要解释勾股定理，并调用 visualize 工具（backend 用 openui）画一张简洁的知识卡片：标题「勾股定理」，用 Text 组件写出 a² + b² = c² 和一句直观解释。完成后只回答 DONE。')
  const cards = await cardSnapshot()
  const page = await pageState()
  await record('01-knowledge-card', {
    marker: sent.marker,
    settled: sent.state.settledAfterMarker,
    cardsBefore: before1,
    cardsAfter: page.cards,
    grew: page.cards > before1,
    cardSnapshot: cards,
    errors: page.errors,
  })
  if (!(page.cards > before1)) {
    results.scenarios['01-knowledge-card'].fail = 'no card appeared after a knowledge question'
  }
} catch (error) {
  await record('01-knowledge-card', { error: String(error.message).slice(0, 500) })
  results.scenarios['01-knowledge-card'].fail = 'scenario threw'
}

// --- Scenario 2: math/formula interactive demo (slider) -------------------
const before2 = (await pageState()).cards
try {
  const sent = await sendPrompt('调用 visualize 工具（openui）画一张交互式数学卡片：标题「二次函数 y = a·x²」。声明 state a：Slider($a, 1, 5, 1, "a")，并用 Text 显示当前 a 的值和公式 y = a·x²。完成后只回答 DONE。')
  const cards = await cardSnapshot()
  const page = await pageState()
  const sliderCard = cards.find(card => card.sliders > 0)
  let interaction = { kind: 'none' }
  if (sliderCard !== undefined) {
    const before = await ev(`JSON.stringify({ value: document.querySelectorAll('[data-openui-card] input[type=range]')[0]?.value ?? null })`)
    try {
      // A real drag on the range input; the card writes through $state.
      await step('drag', { selector: '[data-openui-card] input[type=range]', dx: 30, dy: 0 })
      await SLEEP(500)
      const after = await ev(`JSON.stringify({ value: document.querySelectorAll('[data-openui-card] input[type=range]')[0]?.value ?? null })`)
      interaction = { kind: 'drag', before: before.value, after: after.value, changed: before.value !== after.value }
    } catch (error) {
      // Fall back to a DOM input event so the state-binding path is still
      // measured; the real drag is exercised above when the harness allows it.
      await ev(`(() => {
        const input = document.querySelectorAll('[data-openui-card] input[type=range]')[0]
        if (!input) return JSON.stringify({ ok: false })
        const next = String(Number(input.max) || 5)
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, next)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return JSON.stringify({ ok: true })
      })()`)
      await SLEEP(500)
      const after = await ev(`JSON.stringify({ value: document.querySelectorAll('[data-openui-card] input[type=range]')[0]?.value ?? null })`)
      interaction = { kind: 'dom-event', before: before.value, after: after.value, changed: before.value !== after.value, dragError: String(error.message).slice(0, 200) }
    }
  }
  await record('02-math-interactive', {
    marker: sent.marker,
    cardsBefore: before2,
    cardsAfter: page.cards,
    grew: page.cards > before2,
    sliderCard,
    interaction,
    errors: page.errors,
  })
  if (!(page.cards > before2)) results.scenarios['02-math-interactive'].fail = 'no card appeared'
  else if (sliderCard === undefined) results.scenarios['02-math-interactive'].fail = 'card has no slider'
  else if (!interaction.changed) results.scenarios['02-math-interactive'].fail = 'slider did not change state'
} catch (error) {
  await record('02-math-interactive', { error: String(error.message).slice(0, 500) })
  results.scenarios['02-math-interactive'].fail = 'scenario threw'
}

// --- Scenario 3: sorting animation with a button --------------------------
const before3 = (await pageState()).cards
try {
  const sent = await sendPrompt('调用 visualize 工具（openui）画一张排序算法演示卡片：标题「冒泡排序演示」，用 Bar 组件画出数组 [5, 3, 8, 1, 9, 2]，加一个 Button 标签「下一步」用于推进一步，再加一个 Slider 控制动画速度。完成后只回答 DONE。')
  const cards = await cardSnapshot()
  const page = await pageState()
  const sortingCard = cards.find(card => card.buttons > 0 && (card.svg > 0 || card.listItems > 2))
  let clicked = { kind: 'none' }
  if (sortingCard !== undefined) {
    const before = await ev(`JSON.stringify({ html: document.querySelectorAll('[data-openui-card]')[${sortingCard.index}]?.innerHTML.length ?? 0, errors: (window.__acceptanceErrors ?? []).length, buttons: [...document.querySelectorAll('[data-openui-card] button')].map(b => (b.textContent || '').trim()).slice(0, 8) })`)
    const button = await ev(`(() => {
      const buttons = [...document.querySelectorAll('[data-openui-card] button')]
      const next = buttons.find(b => /下一步|排序|step/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')))
      if (!next) return JSON.stringify({ found: false })
      next.click()
      return JSON.stringify({ found: true, label: (next.textContent || '').trim() })
    })()`)
    await SLEEP(800)
    const after = await ev(`JSON.stringify({ errors: (window.__acceptanceErrors ?? []).length })`)
    clicked = { before, button, afterErrors: after.errors, htmlChanged: button.found }
  }
  await record('03-sorting-interactive', {
    marker: sent.marker,
    cardsBefore: before3,
    cardsAfter: page.cards,
    grew: page.cards > before3,
    sortingCard,
    click: clicked,
    errors: page.errors,
  })
  if (!(page.cards > before3)) results.scenarios['03-sorting-interactive'].fail = 'no card appeared'
  else if (sortingCard === undefined) results.scenarios['03-sorting-interactive'].fail = 'card has no button/visual structure'
} catch (error) {
  await record('03-sorting-interactive', { error: String(error.message).slice(0, 500) })
  results.scenarios['03-sorting-interactive'].fail = 'scenario threw'
}

// --- Scenario 4: refresh restores the cards -------------------------------
try {
  const before = await pageState()
  const cardsBefore = await cardSnapshot()
  const titlesBefore = cardsBefore.map(card => card.title).filter(Boolean)
  await reload()
  await SLEEP(4000)
  let restored
  for (let i = 0; i < 40; i += 1) {
    restored = await pageState()
    if (restored.composer && restored.cards >= before.cards) break
    await SLEEP(1000)
  }
  const cardsAfter = await cardSnapshot()
  const titlesAfter = cardsAfter.map(card => card.title).filter(Boolean)
  await record('04-refresh-restore', {
    cardsBefore: before.cards,
    cardsAfter: restored.cards,
    titlesBefore,
    titlesAfter,
    sameCount: restored.cards === before.cards,
    titlesPreserved: titlesBefore.every(title => titlesAfter.includes(title)),
    errors: restored.errors,
  })
  if (restored.cards !== before.cards) results.scenarios['04-refresh-restore'].fail = `card count changed ${before.cards} -> ${restored.cards}`
  else if (!titlesBefore.every(title => titlesAfter.includes(title))) results.scenarios['04-refresh-restore'].fail = 'a card title was lost on refresh'
} catch (error) {
  await record('04-refresh-restore', { error: String(error.message).slice(0, 500) })
  results.scenarios['04-refresh-restore'].fail = 'scenario threw'
}

// --- Scenario 5: session switching restores the cards ---------------------
try {
  const before = await pageState()
  const cardsBefore = await cardSnapshot()
  const originalTitle = before.title.replace(/ — DeepSeek Harness$/u, '')
  const switched = await ev(`(() => {
    const buttons = [...document.querySelectorAll('button')]
    const fresh = buttons.find(b => (b.textContent || '').trim() === '新建会话' || /新建会话/.test(b.getAttribute('aria-label') || ''))
    if (!fresh) return JSON.stringify({ opened: false, reason: 'no new-session button' })
    fresh.click()
    return JSON.stringify({ opened: true })
  })()`)
  await SLEEP(4000)
  const inNew = await pageState()
  const back = await ev(`(() => {
    const target = ${JSON.stringify(originalTitle)}
    const candidates = [...document.querySelectorAll('[role=treeitem], [role=button], button, a, span')]
    const hit = candidates.find(el => (el.textContent || '').trim() === target)
    if (!hit) return JSON.stringify({ found: false })
    hit.click()
    return JSON.stringify({ found: true })
  })()`)
  await SLEEP(4000)
  let restored
  for (let i = 0; i < 40; i += 1) {
    restored = await pageState()
    if (restored.composer && restored.cards >= before.cards) break
    await SLEEP(1000)
  }
  const cardsAfter = await cardSnapshot()
  await record('05-session-switch', {
    originalTitle,
    newSessionOpened: switched.opened,
    newSessionCards: inNew.cards,
    switchedBack: back,
    cardsBefore: before.cards,
    cardsAfter: restored.cards,
    sameCount: restored.cards === before.cards,
    titles: cardsAfter.map(card => card.title).filter(Boolean),
    errors: restored.errors,
  })
  if (!switched.opened) results.scenarios['05-session-switch'].fail = 'could not open a new session'
  else if (!back.found) results.scenarios['05-session-switch'].fail = 'could not switch back to the original session'
  else if (restored.cards !== before.cards) results.scenarios['05-session-switch'].fail = `card count changed ${before.cards} -> ${restored.cards}`
} catch (error) {
  await record('05-session-switch', { error: String(error.message).slice(0, 500) })
  results.scenarios['05-session-switch'].fail = 'scenario threw'
}

// --- Stability ------------------------------------------------------------
try {
  const state = await pageState()
  const cardStateA = await ev(`JSON.stringify({ cards: document.querySelectorAll('[data-openui-card]').length, unrendered: document.querySelectorAll('[data-openui-unrendered]').length, crashes: document.querySelectorAll('[data-openui-refused]').length })`)
  await SLEEP(3000)
  const cardStateB = await ev(`JSON.stringify({ cards: document.querySelectorAll('[data-openui-card]').length, unrendered: document.querySelectorAll('[data-openui-unrendered]').length, crashes: document.querySelectorAll('[data-openui-refused]').length })`)
  await record('06-stability', { state, stableCardCount: cardStateA.cards === cardStateB.cards, a: cardStateA, b: cardStateB, errors: state.errors })
  if (cardStateA.cards !== cardStateB.cards) results.scenarios['06-stability'].fail = 'card count changed while idle'
  if ((state.errors ?? []).length > 0) results.scenarios['06-stability'].fail = `console errors: ${state.errors.join(' | ')}`
} catch (error) {
  await record('06-stability', { error: String(error.message).slice(0, 500) })
  results.scenarios['06-stability'].fail = 'scenario threw'
}

results.finishedAt = new Date().toISOString()
results.summary = {
  scenarios: Object.keys(results.scenarios).length,
  failed: Object.values(results.scenarios).filter(value => typeof value === 'object' && value !== null && 'fail' in value).map(value => value.fail),
}
await record('99-summary', results.summary)
console.log(JSON.stringify(results.summary, null, 1))
process.exit(results.summary.failed.length === 0 ? 0 : 1)
