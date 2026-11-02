import { createRegistry } from '../../src/core/registry.ts'
import { htmlBackend } from '../../src/backends/html/renderer.ts'
import { openuiBackend } from '../../src/backends/openui/renderer.ts'
import { dispatch } from '../../src/core/dispatcher.ts'
import { RENDER_SCHEMA_VERSION } from '../../src/core/render-contract.ts'
import { openuiMetaFrom, visualizeMetaFrom, visualizationFrom } from '../../src/fragment.ts'
import { renderProgram } from '../../src/client/OpenUICard.tsx'
import { renderToStaticMarkup } from 'react-dom/server'

const registry = createRegistry([htmlBackend('whale'), openuiBackend()])
const program = 'root = Col([Title("Tip splitter"), Text("Each pays " + share), Slider($bill, 0, 500, 5, "Bill")])\nshare = "120.00"'
const routed = dispatch(registry, { backend: 'openui', title: 'Tip', source: program }, { maxSourceBytes: 60000 })

// The exact meta shape legacy-tool.ts projects into the session log.
const meta = {
  schemaVersion: RENDER_SCHEMA_VERSION,
  backend: 'openui',
  title: routed.title,
  mode: routed.mode,
  kind: 'intelligent_ui',
  program,
  path: '~/x.openui.html',
  style: 'whale',
  source: program,
}

const openui = openuiMetaFrom(meta)
const fragment = visualizeMetaFrom(meta)
const descriptor = visualizationFrom(meta)

console.log('dispatch        :', routed.adapter.id)
console.log('openuiMetaFrom  :', openui === undefined ? 'undefined (BUG)' : 'recognised')
console.log('visualizeMetaFrom:', fragment === undefined ? 'declines (correct)' : 'WRONGLY claimed')
console.log('visualizationFrom:', descriptor?.kind)
const { node, error } = renderProgram(openui?.program ?? '')
console.log('render error    :', error ?? 'none')
console.log('rendered html   :', renderToStaticMarkup(node)?.slice(0, 120))