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
    args: [
      { name: 'children', required: true },
      { name: 'gap' },
      { name: 'align', values: ['start', 'center', 'end', 'stretch'] },
    ],
    description: 'Vertical stack; without gap it spaces blocks like an article.',
  },
  {
    name: 'Row',
    group: 'Layout',
    args: [
      { name: 'children', required: true },
      { name: 'gap' },
      { name: 'align', values: ['start', 'center', 'end', 'stretch'] },
      { name: 'justify', values: ['start', 'center', 'end', 'between'] },
      { name: 'wrap' },
    ],
    description: 'Horizontal row; items are vertically centered.',
  },
  {
    name: 'Box',
    group: 'Layout',
    args: [
      { name: 'children' },
      { name: 'direction', values: ['row', 'col'] },
      { name: 'gap' },
      { name: 'padding' },
      { name: 'background' },
      { name: 'radius' },
      { name: 'border' },
      { name: 'width' },
      { name: 'height' },
      { name: 'flex' },
      { name: 'align', values: ['start', 'center', 'end', 'stretch'] },
      { name: 'justify', values: ['start', 'center', 'end', 'between'] },
      { name: 'wrap' },
    ],
    description: 'Flex container, a column by default; radius also clips content.',
  },
  {
    name: 'Grid',
    group: 'Layout',
    args: [
      { name: 'children', required: true },
      { name: 'columns' },
      { name: 'minChildWidth' },
      { name: 'gap' },
    ],
    description: 'Equal columns (2 by default); minChildWidth drops columns when narrow.',
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
    name: 'Carousel',
    group: 'Layout',
    args: [
      { name: 'children', required: true },
      { name: 'itemWidth' },
      { name: 'gap' },
    ],
    description: 'Scrolling, snapping row; each child is itemWidth px wide.',
  },
  {
    name: 'Popover',
    group: 'Layout',
    args: [
      { name: 'trigger', required: true },
      { name: 'content', required: true },
    ],
    description: 'Shows content in a small panel when the trigger is clicked.',
  },
  {
    name: 'Divider',
    group: 'Layout',
    args: [
    ],
    description: 'Thin horizontal rule between blocks.',
  },
  {
    name: 'Spacer',
    group: 'Layout',
    args: [
    ],
    description: 'Fills the free space in a Row.',
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
      { name: 'italic' },
      { name: 'lineThrough' },
      { name: 'tabularNums' },
      { name: 'maxLines' },
    ],
    description: 'Paragraph; text may be a list mixing strings and inline components.',
  },
  {
    name: 'Caption',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'color' },
    ],
    description: 'Small secondary text.',
  },
  {
    name: 'Label',
    group: 'Text',
    args: [
      { name: 'text', required: true },
    ],
    description: 'Field or group label.',
  },
  {
    name: 'Badge',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'color', values: ['info', 'success', 'warning', 'danger', 'purple', 'pink'] },
    ],
    description: 'Small status pill.',
  },
  {
    name: 'Link',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'url', required: true },
    ],
    description: 'Opens an http(s) URL in a new tab.',
  },
  {
    name: 'List',
    group: 'Text',
    args: [
      { name: 'items', required: true },
      { name: 'marker', values: ['bullet', 'number', 'dash', 'check', 'none'] },
      { name: 'timeline' },
    ],
    description: 'Bulleted list; timeline joins the markers with a line.',
  },
  {
    name: 'ListItem',
    group: 'Text',
    args: [
      { name: 'title', required: true },
      { name: 'description' },
      { name: 'marker' },
      { name: 'children' },
    ],
    description: 'List row; marker replaces the bullet or number.',
  },
  {
    name: 'Quote',
    group: 'Text',
    args: [
      { name: 'text', required: true },
      { name: 'cite' },
    ],
    description: 'Quotation or callout with a side rule.',
  },
  {
    name: 'Code',
    group: 'Text',
    args: [
      { name: 'code', required: true },
      { name: 'language' },
    ],
    description: 'Code block with a copy button.',
  },
  {
    name: 'Svg',
    group: 'Drawing',
    args: [
      { name: 'children', required: true },
      { name: 'viewBox', required: true },
      { name: 'width' },
      { name: 'height' },
    ],
    description: 'Scaled drawing; viewBox like "0 0 240 160".',
  },
  {
    name: 'G',
    group: 'Drawing',
    args: [
      { name: 'children', required: true },
      { name: 'transform' },
      { name: 'opacity' },
    ],
    description: 'Group; transform like "rotate(30 50 50)".',
  },
  {
    name: 'Circle',
    group: 'Drawing',
    args: [
      { name: 'cx', required: true },
      { name: 'cy', required: true },
      { name: 'r', required: true },
      { name: 'fill' },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
    ],
    description: 'Circle at (cx, cy) with radius r.',
  },
  {
    name: 'Ellipse',
    group: 'Drawing',
    args: [
      { name: 'cx', required: true },
      { name: 'cy', required: true },
      { name: 'rx', required: true },
      { name: 'ry', required: true },
      { name: 'fill' },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
    ],
    description: 'Ellipse at (cx, cy) with radii rx and ry.',
  },
  {
    name: 'Rect',
    group: 'Drawing',
    args: [
      { name: 'x', required: true },
      { name: 'y', required: true },
      { name: 'width', required: true },
      { name: 'height', required: true },
      { name: 'fill' },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
      { name: 'rx' },
    ],
    description: 'Rectangle, optionally with rounded corners (rx).',
  },
  {
    name: 'Line',
    group: 'Drawing',
    args: [
      { name: 'x1', required: true },
      { name: 'y1', required: true },
      { name: 'x2', required: true },
      { name: 'y2', required: true },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
    ],
    description: 'Straight line between two points.',
  },
  {
    name: 'Path',
    group: 'Drawing',
    args: [
      { name: 'd', required: true },
      { name: 'fill' },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
    ],
    description: 'SVG path; d like "M 0 0 L 10 10".',
  },
  {
    name: 'Polyline',
    group: 'Drawing',
    args: [
      { name: 'points', required: true },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'fill' },
      { name: 'opacity' },
    ],
    description: 'Open polyline; points like "0,0 10,5 20,0".',
  },
  {
    name: 'Polygon',
    group: 'Drawing',
    args: [
      { name: 'points', required: true },
      { name: 'fill' },
      { name: 'stroke' },
      { name: 'strokeWidth' },
      { name: 'opacity' },
    ],
    description: 'Closed polygon; points like "0,0 10,5 20,0".',
  },
  {
    name: 'SvgText',
    group: 'Drawing',
    args: [
      { name: 'text', required: true },
      { name: 'x', required: true },
      { name: 'y', required: true },
      { name: 'size' },
      { name: 'fill' },
      { name: 'anchor', values: ['start', 'middle', 'end'] },
      { name: 'weight', values: ['normal', 'medium', 'semibold'] },
    ],
    description: 'Text inside an Svg drawing.',
  },
  {
    name: 'Button',
    group: 'Inputs',
    args: [
      { name: 'label', required: true },
      { name: 'action' },
      { name: 'variant', values: ['primary', 'secondary', 'ghost', 'outline', 'danger'] },
      { name: 'color', values: ['primary', 'danger', 'success'] },
      { name: 'size', values: ['sm', 'md', 'lg'] },
      { name: 'icon' },
      { name: 'disabled' },
      { name: 'block' },
    ],
    description: 'Button; without an action it sends its label to the assistant.',
  },
  {
    name: 'IconButton',
    group: 'Inputs',
    args: [
      { name: 'icon', required: true },
      { name: 'action' },
      { name: 'label' },
      { name: 'variant', values: ['primary', 'secondary', 'ghost', 'outline', 'danger'] },
    ],
    description: 'Round icon-only button; label is read aloud.',
  },
  {
    name: 'Pressable',
    group: 'Inputs',
    args: [
      { name: 'children', required: true },
      { name: 'action' },
      { name: 'selected' },
      { name: 'padding' },
      { name: 'background' },
      { name: 'radius' },
    ],
    description: 'Makes any content clickable, such as a tile or a swatch.',
  },
  {
    name: 'Input',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'label' },
      { name: 'type', values: ['text', 'number'] },
      { name: 'placeholder' },
    ],
    description: 'Text or number field; a number field stores numbers.',
  },
  {
    name: 'TextArea',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'label' },
      { name: 'placeholder' },
      { name: 'rows' },
    ],
    description: 'Multi-line text field.',
  },
  {
    name: 'Select',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'options', required: true },
      { name: 'label' },
      { name: 'placeholder' },
    ],
    description: 'Dropdown, for long option lists.',
  },
  {
    name: 'SegmentedControl',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'options', required: true },
      { name: 'block' },
    ],
    description: 'Two to four short choices in a row.',
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
      { name: 'marks' },
    ],
    description: 'Range slider; unit like "%" or "$" formats the value.',
  },
  {
    name: 'Checkbox',
    group: 'Inputs',
    args: [
      { name: 'checked', required: true },
      { name: 'label', required: true },
      { name: 'lineThrough' },
    ],
    description: 'Checkbox; lineThrough strikes the label when checked.',
  },
  {
    name: 'RadioGroup',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'options', required: true },
      { name: 'label' },
      { name: 'variant', values: ['list', 'cards'] },
    ],
    description: 'Radio choices; cards add a description line.',
  },
  {
    name: 'DatePicker',
    group: 'Inputs',
    args: [
      { name: 'value', required: true },
      { name: 'label' },
      { name: 'min' },
      { name: 'max' },
    ],
    description: 'Date field; dates are "YYYY-MM-DD".',
  },
  {
    name: 'Timer',
    group: 'Inputs',
    args: [
      { name: 'seconds', required: true },
      { name: 'label' },
    ],
    description: 'Countdown with start, pause and reset; it counts the bound seconds down.',
  },
  {
    name: 'Form',
    group: 'Inputs',
    args: [
      { name: 'children', required: true },
    ],
    description: 'Groups fields; their values travel with an @ToAssistant inside.',
  },
  {
    name: 'Image',
    group: 'Media and data',
    args: [
      { name: 'src', required: true },
      { name: 'alt', required: true },
      { name: 'aspectRatio' },
      { name: 'radius' },
      { name: 'fit', values: ['cover', 'contain'] },
    ],
    description: 'Photo from a URL the user or a tool gave.',
  },
  {
    name: 'Icon',
    group: 'Media and data',
    args: [
      { name: 'name', required: true },
      { name: 'size', values: ['sm', 'md', 'lg', 'xl'] },
      { name: 'color' },
    ],
    description: 'Lucide icon by name, e.g. "map-pin".',
  },
  {
    name: 'Table',
    group: 'Media and data',
    args: [
      { name: 'columns', required: true },
      { name: 'rows', required: true },
    ],
    description: 'Rows of cells in column order; a cell may be a component.',
  },
  {
    name: 'Chart',
    group: 'Media and data',
    args: [
      { name: 'type', values: ['bar', 'line', 'area', 'pie', 'donut', 'scatter'], required: true },
      { name: 'data', required: true },
      { name: 'x' },
      { name: 'series' },
      { name: 'format', values: ['number', 'currency', 'percent'] },
      { name: 'currency' },
      { name: 'stacked' },
      { name: 'height' },
    ],
    description: 'Chart of row objects; x is the category key, series the value keys.',
  },
  {
    name: 'Flashcard',
    group: 'Play',
    args: [
      { name: 'front', required: true },
      { name: 'back', required: true },
      { name: 'hint' },
    ],
    description: 'Card that flips between front and back when tapped.',
  },
  {
    name: 'Celebration',
    group: 'Play',
    args: [
      { name: 'when', required: true },
    ],
    description: 'Bursts confetti when its condition turns true.',
  },
]

/** Every `@function` this build ships, in prompt order. */
export const FUNCTIONS: readonly FunctionSignature[] = [
  {
    name: 'Count',
    signature: '@Count(list)',
    description: 'Returns the number of items, or 0 for null.',
  },
  {
    name: 'First',
    signature: '@First(list)',
    description: 'First item, or null for an empty list.',
  },
  {
    name: 'Last',
    signature: '@Last(list)',
    description: 'Last item, or null for an empty list.',
  },
  {
    name: 'Sum',
    signature: '@Sum(nums)',
    description: 'Total of the numbers; null and blank entries are skipped.',
  },
  {
    name: 'Avg',
    signature: '@Avg(nums)',
    description: 'Mean of the numbers, skipping null and blank; 0 when none.',
  },
  {
    name: 'Min',
    signature: '@Min(nums)',
    description: 'Smallest number, skipping null and blank; null when none.',
  },
  {
    name: 'Max',
    signature: '@Max(nums)',
    description: 'Largest number, skipping null and blank; null when none.',
  },
  {
    name: 'Sort',
    signature: '@Sort(list,field,dir?)',
    description: 'Copy sorted by field; direction "asc" (default) or "desc" (ascending/descending also accepted).',
  },
  {
    name: 'Filter',
    signature: '@Filter(list,field,op,value)',
    description: 'Rows whose field matches; operator == != > < >= <= contains, field "" for the item itself; a missing field never matches > < >= <=.',
  },
  {
    name: 'Round',
    signature: '@Round(num,dec?)',
    description: 'Rounds to N decimal places (default 0).',
  },
  {
    name: 'Abs',
    signature: '@Abs(num)',
    description: 'Absolute value.',
  },
  {
    name: 'Floor',
    signature: '@Floor(num)',
    description: 'Rounds down to the nearest integer.',
  },
  {
    name: 'Ceil',
    signature: '@Ceil(num)',
    description: 'Rounds up to the nearest integer.',
  },
  {
    name: 'Append',
    signature: '@Append(list,item)',
    description: 'Copy of the list with item at the end.',
  },
  {
    name: 'Prepend',
    signature: '@Prepend(list,item)',
    description: 'Copy of the list with item at the start.',
  },
  {
    name: 'Concat',
    signature: '@Concat(list,more)',
    description: 'Joins two lists.',
  },
  {
    name: 'Remove',
    signature: '@Remove(list,field,value)',
    description: 'Copy without the items whose field equals value; field "" compares the items themselves.',
  },
  {
    name: 'RemoveAt',
    signature: '@RemoveAt(list,index)',
    description: 'Copy without the item at index (negative counts from the end).',
  },
  {
    name: 'Update',
    signature: '@Update(list,field,value,setField,setValue)',
    description: 'Copy where matching items get setField set to setValue.',
  },
  {
    name: 'Toggle',
    signature: '@Toggle(list,item)',
    description: 'Adds item when missing, removes it when present.',
  },
  {
    name: 'Includes',
    signature: '@Includes(list,item)',
    description: 'True when the list has item, or the text contains it.',
  },
  {
    name: 'Find',
    signature: '@Find(list,field,value)',
    description: 'First item whose field equals value, or null.',
  },
  {
    name: 'IndexOf',
    signature: '@IndexOf(list,item)',
    description: 'Index of item, or -1.',
  },
  {
    name: 'Take',
    signature: '@Take(list,n)',
    description: 'First n items; a negative n takes the last n.',
  },
  {
    name: 'Slice',
    signature: '@Slice(list,start,end?)→list | string',
    description: 'Items, or characters, from start up to end; negative counts from the end.',
  },
  {
    name: 'Unique',
    signature: '@Unique(list)',
    description: 'Distinct items in first-seen order.',
  },
  {
    name: 'Reverse',
    signature: '@Reverse(list)',
    description: 'Copy in reverse order.',
  },
  {
    name: 'Range',
    signature: '@Range(start,end,step?)',
    description: 'Numbers from start up to end, by step (default 1).',
  },
  {
    name: 'Pick',
    signature: '@Pick(list)',
    description: 'A random item, or null when empty; draws anew each time, so call it inside @Set.',
  },
  {
    name: 'Shuffle',
    signature: '@Shuffle(list)',
    description: 'Copy in random order; call it inside @Set.',
  },
  {
    name: 'Flatten',
    signature: '@Flatten(list)',
    description: 'One list from a list of lists.',
  },
  {
    name: 'Chunk',
    signature: '@Chunk(list,size)→list[]',
    description: 'The list cut into lists of size items.',
  },
  {
    name: 'Pow',
    signature: '@Pow(base,exp)',
    description: 'Base raised to exponent.',
  },
  {
    name: 'Sqrt',
    signature: '@Sqrt(num)',
    description: 'Square root; null for a negative number.',
  },
  {
    name: 'Random',
    signature: '@Random(min,max,int?)',
    description: 'Random number from min to max; call it inside @Set.',
  },
  {
    name: 'Clamp',
    signature: '@Clamp(num,min,max)',
    description: 'Number kept between min and max.',
  },
  {
    name: 'Percent',
    signature: '@Percent(part,total)',
    description: 'part / total * 100; 0 when total is 0.',
  },
  {
    name: 'Lerp',
    signature: '@Lerp(a,b,t)',
    description: 'Value a fraction t of the way from a to b.',
  },
  {
    name: 'Allocate',
    signature: '@Allocate(total,weights,dec?)',
    description: 'Splits total in proportion to weights so the parts add up to exactly total.',
  },
  {
    name: 'Payment',
    signature: '@Payment(principal,rate,periods)',
    description: 'Payment per period at rate percent per period.',
  },
  {
    name: 'Convert',
    signature: '@Convert(value,from,to)',
    description: 'Unit conversion: length, mass, volume, speed, area and c/f/k.',
  },
  {
    name: 'Format',
    signature: '@Format(value,kind?,dec?,currency?)',
    description: 'Number as text: "number" (default), "currency", "percent" (45 → 45%) or "compact" (1.2M); any other kind is an error.',
  },
  {
    name: 'Join',
    signature: '@Join(list,sep?,field?)',
    description: 'Joins the items, or their field, skipping nulls; separator defaults to ", ".',
  },
  {
    name: 'Plural',
    signature: '@Plural(n,word,plural?)',
    description: 'Count and word: @Plural(1, "guest") is "1 guest".',
  },
  {
    name: 'Pad',
    signature: '@Pad(value,length,char?)',
    description: 'Pads the start of value to length with char (default "0").',
  },
  {
    name: 'Upper',
    signature: '@Upper(text)',
    description: 'Text in upper case.',
  },
  {
    name: 'Lower',
    signature: '@Lower(text)',
    description: 'Text in lower case.',
  },
  {
    name: 'Trim',
    signature: '@Trim(text)',
    description: 'Text without spaces at the start and end.',
  },
  {
    name: 'Capitalize',
    signature: '@Capitalize(text)',
    description: 'Each word with a capital first letter.',
  },
  {
    name: 'Split',
    signature: '@Split(text,sep?)→string[]',
    description: 'Parts of text between separator (default ","), trimmed, empty parts dropped.',
  },
  {
    name: 'Replace',
    signature: '@Replace(text,find,with)',
    description: 'Text with every find replaced.',
  },
  {
    name: 'Duration',
    signature: '@Duration(seconds,style?)',
    description: 'Seconds as text: "short" (default) 1h 20m or 4m 05s, "clock" 4:05; any other style is an error.',
  },
  {
    name: 'Default',
    signature: '@Default(value,fallback)',
    description: 'Value, or fallback when the value is null, "" or NaN.',
  },
  {
    name: 'MixColor',
    signature: '@MixColor(from,to,t)',
    description: 'The hex colour a fraction t of the way from one hex colour to another.',
  },
  {
    name: 'Now',
    signature: '@Now()',
    description: 'The current date and time as an ISO string.',
  },
  {
    name: 'Today',
    signature: '@Today()',
    description: 'Today\'s date in the viewer\'s time zone, as "YYYY-MM-DD".',
  },
  {
    name: 'FormatDate',
    signature: '@FormatDate(date,style?)',
    description: 'A date as text: "date", "short", "long", "weekday", "month", "time", "datetime" or "iso".',
  },
  {
    name: 'AddDays',
    signature: '@AddDays(date,days)',
    description: 'The date days later (negative: earlier) as "YYYY-MM-DD".',
  },
  {
    name: 'AddMonths',
    signature: '@AddMonths(date,months)',
    description: 'The date months later, kept within the month, as "YYYY-MM-DD".',
  },
  {
    name: 'DaysBetween',
    signature: '@DaysBetween(from,to)',
    description: 'Calendar days from one date to another.',
  },
  {
    name: 'MonthsBetween',
    signature: '@MonthsBetween(from,to)',
    description: 'Whole months from one date to another.',
  },
  {
    name: 'StartOf',
    signature: '@StartOf(date,unit)',
    description: 'First day of the "week" (Monday), "month" or "year", as "YYYY-MM-DD".',
  },
  {
    name: 'GroupBy',
    signature: '@GroupBy(rows,key,field?,agg?)→{key,value}[]',
    description: 'One row per distinct key in first-seen order; agg is sum (default), avg, count (counts rows), min or max; without field it counts rows.',
  },
  {
    name: 'Pivot',
    signature: '@Pivot(rows,rowKey,colKey,field?,agg?)→object[]',
    description: 'One row per rowKey value with a "key" column and one column per colKey value; a label colliding with "key" or an earlier column gets a " (2)" suffix.',
  },
  {
    name: 'Top',
    signature: '@Top(rows,field,n,dir?)',
    description: 'The n rows with the largest field ("asc"/"ascending": the smallest).',
  },
  {
    name: 'Between',
    signature: '@Between(rows,field,min?,max?)',
    description: 'Rows whose field is from min to max, both included; null leaves an open end; a missing field never matches.',
  },
  {
    name: 'Bucket',
    signature: '@Bucket(rows,dateField,unit,field?,agg?)→{key,value}[]',
    description: 'Rows per "day", "week" (from Monday) or "month" of dateField, in date order, missing periods filled with 0 for sum/avg/count and null for min/max.',
  },
  {
    name: 'Cumulative',
    signature: '@Cumulative(rows,field)',
    description: 'Copy of the rows with field replaced by its running total; field "" for a list of numbers.',
  },
  {
    name: 'MovingAvg',
    signature: '@MovingAvg(rows,field,window)',
    description: 'Copy of the rows with field replaced by the average of its last window numeric values; missing values are skipped.',
  },
  {
    name: 'Change',
    signature: '@Change(now,before)',
    description: 'Percent change from previous to current, relative to |previous|; null when previous is 0.',
  },
  {
    name: 'Histogram',
    signature: '@Histogram(values,bins,min?,max?)→{key,value,start,end}[]',
    description: 'Counts numbers into equal-width bins, skipping null and blank; min and max fix the range.',
  },
  {
    name: 'Stats',
    signature: '@Stats(values)→{count,min,max,mean,median,stdev}',
    description: 'Summary of the numbers, skipping null and blank; all zeros for an empty list.',
  },
  {
    name: 'Each',
    signature: '@Each(list,"varName",template)',
    description: 'Evaluates template for every item with the loop variable bound to it, and concatenates the results.',
  },
]

/** Component names, for name checking. */
export const COMPONENT_NAMES: readonly string[] = COMPONENTS.map(component => component.name)

/** `@function` names without the sigil, for name checking. */
export const FUNCTION_NAMES: readonly string[] = FUNCTIONS.map(fn => fn.name)

/** Action steps a program may name next to the built-in functions. */
export const ACTION_STEPS: readonly string[] = [
  'Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action',
]
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

**Actions** — the \`action\` of a Button is one step:

- \`@Set($var, value)\` and \`@Reset()\` change \`$state\`.
- \`Action([...])\` runs several steps in order.
- \`@CopyToClipboard(text)\` copies its text, and the Button then shows that text
  in full so the reader sees exactly what will be copied. It must be the whole
  action — inside \`Action([...])\` it is refused and copies nothing. Keep the text
  under 32 KiB.

**Do not use \`@OpenUrl\` or \`@ToAssistant\`.** The language declares them, but this
build refuses them, so a Button carrying one does nothing when pressed. Write an
address out as text, or use \`Link(\"label\", \"https://example.com\")\` — a link the
reader clicks themselves, which is what \`@OpenUrl\` would have produced.
`
}