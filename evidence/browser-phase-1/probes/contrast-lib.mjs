// WCAG contrast helpers (Node side: no CLI quoting of backslashes).
export function parseColor(value) {
  const text = String(value).trim()
  if (text.startsWith('#')) {
    const hex = text.slice(1)
    if (hex.length < 6) return null
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }
  const open = text.indexOf('(')
  if (open === -1) return null
  const parts = text.slice(open + 1, text.indexOf(')')).split(',').map(p => Number(p.trim()))
  if (parts.length < 3 || parts.some(n => !Number.isFinite(n))) return null
  return [parts[0], parts[1], parts[2]]
}

export function luminance(rgb) {
  const ch = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(a, b) {
  const la = luminance(parseColor(a))
  const lb = luminance(parseColor(b))
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100
}
