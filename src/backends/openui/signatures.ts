/**
 * The component and `@function` tables this backend ships.
 *
 * This file is the single authority for what the visualize skill teaches about
 * openui-lang: the skill text is generated from these tables, so the prompt can
 * never name a component or function the evaluator does not have. That failure
 * mode — teaching a name that silently falls back — is the one the upstream
 * port was observed to have, so the two are kept in one place here.
 *
 * Milestone 1 ships the layout, text and input primitives the seat needs to
 * prove both backends coexist. The rest arrive with their renderers.
 *
 * @module @dsh-unified/visualize/backends/openui/signatures
 */

/** One positional argument of a component. */
export interface ComponentArg {
  readonly name: string
  /** Enum members, when the argument takes one of a fixed set. */
  readonly values?: readonly string[]
  /** Whether the argument is required. */
  readonly required?: boolean
}

/** One component this backend can draw. */
export interface ComponentSignature {
  readonly name: string
  /** Prompt group the component belongs to. */
  readonly group: 'Layout' | 'Text' | 'Inputs' | 'Media and data' | 'Play' | 'Drawing'
  readonly args: readonly ComponentArg[]
  /** One short line teaching the component. */
  readonly description: string
}

/** One `@function` this backend can evaluate. */
export interface FunctionSignature {
  /** Name without the `@` sigil. */
  readonly name: string
  /** Compact signature, as the skill teaches it. */
  readonly signature: string
  /** One line of detail. */
  readonly description: string
}

/** Every component this build ships, in prompt order. */
export const COMPONENTS: readonly ComponentSignature[] = [
  {
    name: 'Col',
    group: 'Layout',
    args: [{ name: 'children', required: true }, { name: 'gap' }],
    description: 'Vertical stack; without gap it spaces blocks like an article.',
  },
  {
    name: 'Row',
    group: 'Layout',
    args: [{ name: 'children', required: true }, { name: 'gap' }, { name: 'justify', values: ['start', 'center', 'end', 'between'] }],
    description: 'Horizontal row; items are vertically centered.',
  },
  {
    name: 'Card',
    group: 'Layout',
    args: [
      { name: 'children', required: true },
      { name: 'variant', values: ['soft', 'outlined', 'elevated'] },
      { name: 'padding' },
      { name: 'gap' },
    ],
    description: 'Panel; outlined is border-only, soft a filled panel, elevated a raised panel.',
  },
  {
    name: 'Title',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'size', values: ['sm', 'md', 'lg', 'xl', '2xl', '3xl'] },
      { name: 'color' },
    ],
    description: 'Heading; lg for a card title, 2xl for a big number.',
  },
  {
    name: 'Text',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'size', values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] },
      { name: 'color' },
      { name: 'weight', values: ['normal', 'medium', 'semibold'] },
    ],
    description: 'Paragraph; text may be a list mixing strings and inline components.',
  },
  {
    name: 'Caption',
    group: 'Text',
    args: [{ name: 'text', required: true }, { name: 'color' }],
    description: 'Small secondary text.',
  },
  {
    name: 'Button',
    group: 'Inputs',
    args: [
      { name: 'label', required: true },
      { name: 'action' },
      { name: 'variant', values: ['primary', 'secondary', 'ghost', 'outline', 'danger'] },
      { name: 'size', values: ['sm', 'md', 'lg'] },
      { name: 'icon' },
      { name: 'disabled' },
    ],
    description: 'Runs one action step; without an action it sends its label.',
  },
  {
    name: 'Slider',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'min', required: true },
      { name: 'max', required: true },
      { name: 'step' },
      { name: 'label' },
      { name: 'unit' },
    ],
    description: 'Range slider bound to a $variable; unit like "%" or "$" formats the value.',
  },
]

/** Every `@function` this build ships, in prompt order. */
export const FUNCTIONS: readonly FunctionSignature[] = [
  { name: 'Count', signature: '@Count(list)', description: 'Number of items, or 0 for null.' },
  { name: 'Sum', signature: '@Sum(nums)', description: 'Total of the numbers, skipping null and blank.' },
  { name: 'Avg', signature: '@Avg(nums)', description: 'Mean of the numbers; 0 when none.' },
  { name: 'Min', signature: '@Min(nums)', description: 'Smallest number, or null when none.' },
  { name: 'Max', signature: '@Max(nums)', description: 'Largest number, or null when none.' },
  { name: 'Round', signature: '@Round(num,dec?)', description: 'Rounds to N decimal places (default 0).' },
  { name: 'Abs', signature: '@Abs(num)', description: 'Absolute value.' },
  { name: 'Floor', signature: '@Floor(num)', description: 'Rounds down to the nearest integer.' },
  { name: 'Ceil', signature: '@Ceil(num)', description: 'Rounds up to the nearest integer.' },
  { name: 'Clamp', signature: '@Clamp(num,min,max)', description: 'Constrains a number to a range.' },
  { name: 'Format', signature: '@Format(value,kind?,dec?)', description: 'Formats a number for reading.' },
  { name: 'Join', signature: '@Join(list,sep?)', description: 'Joins items into one string.' },
  { name: 'Each', signature: '@Each(list,"name",template)', description: 'Maps a list into rows; the loop variable has no $.' },
  { name: 'Range', signature: '@Range(start,end,step?)', description: 'A list of numbers.' },
  { name: 'Toggle', signature: '@Toggle(list,item)', description: 'Copy of the list with item added or removed.' },
  { name: 'Includes', signature: '@Includes(list,item)', description: 'Whether the list holds the item.' },
  { name: 'Default', signature: '@Default(value,fallback)', description: 'Value, or the fallback when it is null.' },
]

/** Component names, for name checking. */
export const COMPONENT_NAMES: readonly string[] = COMPONENTS.map(component => component.name)

/** `@function` names without the sigil, for name checking. */
export const FUNCTION_NAMES: readonly string[] = FUNCTIONS.map(fn => fn.name)

/** Action steps a program may name next to the built-in functions. */
export const ACTION_STEPS: readonly string[] = ['Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action']

/**
 * Build the skills section that teaches this language.
 *
 * Generated from the tables above, so it cannot drift from what the evaluator
 * implements.
 * @returns the markdown section.
 */
export function languageReference(): string {
  const groups: Record<string, string[]> = {}
  for (const component of COMPONENTS) {
    const args = component.args
      .map(arg => arg.required === true ? arg.name : `${arg.name}?`)
      .join(',')
    const line = `- ${component.name}(${args}) — ${component.description}`
    groups[component.group] ??= []
    groups[component.group]!.push(line)
  }

  const componentText = Object.entries(groups)
    .map(([group, lines]) => `**${group}**\n${lines.join('\n')}`)
    .join('\n\n')

  const enumText = COMPONENTS
    .flatMap(component => component.args
      .filter(arg => arg.values !== undefined)
      .map(arg => `  - \`${component.name}.${arg.name}\`: ${arg.values!.join(' | ')}`))
    .join('\n')

  const functionText = FUNCTIONS
    .map(fn => `- ${fn.signature} — ${fn.description}`)
    .join('\n')

  return `## openui-lang

One statement per physical line: \`name = expression\`, or \`$name = expression\`
for state. Statements never span lines, so a long array stays on one line.
\`root = Col([...])\` is the entry point. Arguments are positional.

${componentText}

**Enum values** — a wrong value falls back silently, so use these exactly:
${enumText}
  - \`@Format\` kind: number | currency | percent | compact

**@functions**

${functionText}

**Actions** — the \`action\` of a Button is one step: \`@Set($var, value)\`,
\`@Reset()\`, \`@OpenUrl(url)\`, \`@CopyToClipboard(text)\`,
\`@ToAssistant(message)\`.
`
}
