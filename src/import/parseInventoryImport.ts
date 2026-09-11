import * as XLSX from 'xlsx'
import type { NewBeamInput, NewUprightInput, NewWireDeckInput } from '../db/items'
import type { Condition } from '../models/types'

type ParsedUpright = Omit<NewUprightInput, 'siteId' | 'photoFiles'>
type ParsedBeam = Omit<NewBeamInput, 'siteId' | 'photoFiles'>
type ParsedWireDeck = Omit<NewWireDeckInput, 'siteId' | 'photoFiles'>

export interface ImportParseResult {
  uprights: ParsedUpright[]
  beams: ParsedBeam[]
  wireDecks: ParsedWireDeck[]
  otherSkipped: number
}

function stripQuotes(text: string): string {
  return text.replace(/["″""]/g, '').trim()
}

function parseFraction(text: string): number | null {
  const cleaned = stripQuotes(text)
  if (!cleaned) return null
  let m = cleaned.match(/^(\d+)[\s-](\d+)\/(\d+)$/)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = cleaned.match(/^(\d+)\/(\d+)$/)
  if (m) return Number(m[1]) / Number(m[2])
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function cleanupNotes(text: string): string {
  return text
    .replace(/[;,:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s;,:.\-&]+|[\s;,:.\-&]+$/g, '')
}

function prependFlag(notes: string, flag: string): string {
  return notes ? `[${flag}] ${notes}` : `[${flag}]`
}

const COLOR_WORDS = ['orange', 'green', 'blue', 'gray', 'grey']

function extractColor(text: string): { color: string; remaining: string } {
  const found: string[] = []
  for (const word of COLOR_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    if (re.test(text)) {
      const canonical = word === 'grey' ? 'Gray' : word[0].toUpperCase() + word.slice(1)
      if (!found.includes(canonical)) found.push(canonical)
    }
  }
  if (found.length === 0) return { color: '', remaining: text }
  if (found.length === 1) {
    return { color: found[0], remaining: text.replace(new RegExp(`\\b${found[0]}\\b`, 'i'), ' ') }
  }
  return { color: 'Mixed', remaining: text }
}

function extractCondition(text: string): { condition: Condition; remaining: string } {
  if (/\brust(y)?\b/i.test(text)) {
    return { condition: 'Rusty', remaining: text.replace(/\brust(y)?\b/i, ' ') }
  }
  if (/\blike new\b/i.test(text)) {
    return { condition: 'Like New', remaining: text.replace(/\blike new\b/i, ' ') }
  }
  if (/\bpoor\b/i.test(text)) {
    return { condition: 'Poor', remaining: text.replace(/\bpoor\b/i, ' ') }
  }
  return { condition: 'Good', remaining: text }
}

function extractStyle(text: string, patterns: [RegExp, string][]): { style: string; remaining: string } {
  for (const [re, label] of patterns) {
    if (re.test(text)) return { style: label, remaining: text.replace(re, ' ') }
  }
  return { style: '', remaining: text }
}

const UPRIGHT_STYLE_PATTERNS: [RegExp, string][] = [
  [/\bMecalux\b/i, 'Mecalux'],
  [/\bT[\s-]?Bolt\b/i, 'TBOLT'],
  [/\bTeardrop\b/i, 'Teardrop'],
  [/\bTD\b/i, 'Teardrop'],
  [/\bNew Style\b/i, 'New Style'],
  [/\bNS\b/i, 'New Style'],
  [/\bRidg-?U-?Rak\b/i, 'Ridg-U-Rak'],
  [/\bRu?R\b/i, 'Ridg-U-Rak'],
]

const BEAM_STYLE_PATTERNS: [RegExp, string][] = [
  [/\bT[\s-]?Bolt\b/i, 'TBOLT'],
  [/\bTeardrop\b/i, 'Teardrop'],
  [/\bTD\b/i, 'Teardrop'],
  [/\bNew Style\b/i, 'New Style'],
  [/\bNS\b/i, 'New Style'],
  [/\bRidg-?U-?Rak\b/i, 'Ridg-U-Rak'],
  [/\bRu?R\b/i, 'Ridg-U-Rak'],
]

function extractPinCount(text: string): { pinCount: string; remaining: string } {
  if (/\d+\s*-\s*\d+\s*pin/i.test(text)) return { pinCount: '', remaining: text }
  const m = text.match(/(\d+)[\s-]*pin/i)
  if (m) {
    const words: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' }
    const word = words[Number(m[1])]
    if (word) return { pinCount: word, remaining: text.replace(m[0], ' ') }
  }
  return { pinCount: '', remaining: text }
}

function extractStickers(text: string): { stickers: string; remaining: string } {
  if (/\bstickers?\b/i.test(text)) return { stickers: 'Yes', remaining: text.replace(/\bstickers?\b/i, ' ') }
  return { stickers: '', remaining: text }
}

function extractFootplate(text: string): { length: number | null; width: number | null; remaining: string } {
  const sizeThenFp = text.match(
    /(\d+(?:\.\d+)?(?:[\s-]\d+\/\d+)?)\s*["″""]?\s*x\s*(\d+(?:\.\d+)?(?:[\s-]\d+\/\d+)?)\s*["″""]?\s*FP/i,
  )
  if (sizeThenFp) {
    return {
      length: parseFraction(sizeThenFp[1]),
      width: parseFraction(sizeThenFp[2]),
      remaining: text.replace(sizeThenFp[0], ' '),
    }
  }
  const fpThenSize = text.match(
    /FP\s*(\d+(?:\.\d+)?(?:[\s-]\d+\/\d+)?)\s*["″""]?\s*x\s*(\d+(?:\.\d+)?(?:[\s-]\d+\/\d+)?)\s*["″""]?/i,
  )
  if (fpThenSize) {
    return {
      length: parseFraction(fpThenSize[1]),
      width: parseFraction(fpThenSize[2]),
      remaining: text.replace(fpThenSize[0], ' '),
    }
  }
  return { length: null, width: null, remaining: text }
}

function extractHoles(text: string): { count: number | null; size: string; remaining: string } {
  const m = text.match(/(\d+)\s*(?:H\b|holes?\b)\s*(\d+(?:\/\d+)?)["″""]?/i)
  if (m) return { count: Number(m[1]), size: m[2], remaining: text.replace(m[0], ' ') }
  return { count: null, size: '', remaining: text }
}

const WIRE_DECK_STYLE_PATTERNS: [RegExp, string][] = [
  [/\bDWF\b/i, 'Double Waterfall'],
  [/\bDbl\.?\s*W(?:aterfall|F)\b/i, 'Double Waterfall'],
  [/inside\s*w\.?f\.?\b/i, 'Inside Waterfall'],
  [/inside\s*waterfall/i, 'Inside Waterfall'],
  [/lay[\s-]?in/i, 'Lay-in'],
  [/flang(?:ed|e)|flared/i, 'Flared/Flanged'],
]

function extractWireDeckStyles(text: string): { styles: string[]; remaining: string } {
  const styles: string[] = []
  let remaining = text
  for (const [re, label] of WIRE_DECK_STYLE_PATTERNS) {
    if (re.test(remaining) && !styles.includes(label)) {
      styles.push(label)
      remaining = remaining.replace(re, ' ')
    }
  }
  return { styles, remaining }
}

function extractChannelCount(text: string): { channelCount: string; remaining: string } {
  const m = text.match(/(\d+)[\s-]?chnl/i)
  if (m) return { channelCount: m[1], remaining: text.replace(m[0], ' ') }
  return { channelCount: '', remaining: text }
}

interface UprightDims {
  width: number
  heightFeet: number
  heightInches: number
  columnLength: number
  columnWidth: number
}

function parseUprightSize(sizeRaw: string): UprightDims | null {
  const parts = sizeRaw
    .split(/\s+x\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return null

  const width = parseFraction(parts[0])
  if (width == null) return null

  const heightToken = stripQuotes(parts[1])
  const wholeFeetMatch = heightToken.match(/^(\d+)'\s*(\d+)?$/)
  const decimalFeetMatch = heightToken.match(/^(\d+(?:\.\d+)?)'$/)
  let heightFeet: number | null = null
  let heightInches = 0
  if (wholeFeetMatch) {
    heightFeet = Number(wholeFeetMatch[1])
    heightInches = wholeFeetMatch[2] ? Number(wholeFeetMatch[2]) : 0
  } else if (decimalFeetMatch) {
    const decimal = Number(decimalFeetMatch[1])
    heightFeet = Math.floor(decimal)
    heightInches = Math.round((decimal - heightFeet) * 12)
  }
  if (heightFeet == null) return null

  let columnLength = 0
  let columnWidth = 0
  if (parts.length >= 3) {
    const colSizeStr = stripQuotes(parts.slice(2).join(' x '))
    const colParts = colSizeStr
      .split(/\s*x\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
    columnLength = colParts[0] != null ? (parseFraction(colParts[0]) ?? 0) : 0
    columnWidth = colParts[1] != null ? (parseFraction(colParts[1]) ?? 0) : 0
  }

  return { width, heightFeet, heightInches, columnLength, columnWidth }
}

function parseBeamSize(sizeRaw: string): { width: string; length: number } | null {
  const parts = sizeRaw
    .split(/\s+x\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return null

  const widthToken = stripQuotes(parts[0])
  let width: string | null
  const rangeMatch = widthToken.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (rangeMatch) {
    width = `${rangeMatch[1]}-${rangeMatch[2]}`
  } else {
    const n = parseFraction(widthToken)
    width = n != null ? String(n) : null
  }
  if (width == null) return null

  const length = parseFraction(parts[1])
  if (length == null) return null

  return { width, length }
}

function parseWireDeckSize(sizeRaw: string): { width: number; length: number } | null {
  const parts = sizeRaw
    .split(/\s+x\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const width = parseFraction(parts[0])
  const length = parseFraction(parts[1])
  if (width == null || length == null) return null
  return { width, length }
}

function buildUpright(quantity: number, qtyFlagged: boolean, sizeRaw: string, notesRaw: string): ParsedUpright {
  const dims = parseUprightSize(sizeRaw)

  let text = notesRaw
  const condition = extractCondition(text)
  text = condition.remaining
  const style = extractStyle(text, UPRIGHT_STYLE_PATTERNS)
  text = style.remaining
  const fp = extractFootplate(text)
  text = fp.remaining
  const holes = extractHoles(text)
  text = holes.remaining
  const color = extractColor(text)
  text = color.remaining

  let notes = cleanupNotes(text)
  if (qtyFlagged) notes = prependFlag(notes, 'Qty not listed on import')
  if (!dims) notes = prependFlag(notes, `Could not parse size "${sizeRaw}"`)

  return {
    quantity,
    condition: condition.condition,
    bundleSize: '',
    zone: '',
    notes,
    color: color.color,
    style: style.style,
    width: dims?.width ?? 0,
    heightFeet: dims?.heightFeet ?? 0,
    heightInches: dims?.heightInches ?? 0,
    columnLength: dims?.columnLength ?? 0,
    columnWidth: dims?.columnWidth ?? 0,
    footplateLength: fp.length ?? 0,
    footplateWidth: fp.width ?? 0,
    anchorHoleCount: holes.count ?? 0,
    holeSize: holes.size,
    gauge: '',
    stamp: '',
  }
}

function buildBeam(quantity: number, qtyFlagged: boolean, sizeRaw: string, notesRaw: string): ParsedBeam {
  const dims = parseBeamSize(sizeRaw)

  let text = notesRaw
  const condition = extractCondition(text)
  text = condition.remaining
  const style = extractStyle(text, BEAM_STYLE_PATTERNS)
  text = style.remaining
  const pin = extractPinCount(text)
  text = pin.remaining
  const stickers = extractStickers(text)
  text = stickers.remaining
  const color = extractColor(text)
  text = color.remaining

  let notes = cleanupNotes(text)
  if (qtyFlagged) notes = prependFlag(notes, 'Qty not listed on import')
  if (!dims) notes = prependFlag(notes, `Could not parse size "${sizeRaw}"`)

  return {
    quantity,
    condition: condition.condition,
    bundleSize: '',
    zone: '',
    notes,
    length: dims?.length ?? 0,
    width: dims?.width ?? '',
    color: color.color,
    pinCount: pin.pinCount,
    stamp: '',
    style: style.style,
    stickers: stickers.stickers,
    step: '',
  }
}

function buildWireDeck(quantity: number, qtyFlagged: boolean, sizeRaw: string, notesRaw: string): ParsedWireDeck {
  const dims = parseWireDeckSize(sizeRaw)

  let text = notesRaw
  const condition = extractCondition(text)
  text = condition.remaining
  const style = extractWireDeckStyles(text)
  text = style.remaining
  const channel = extractChannelCount(text)
  text = channel.remaining

  let notes = cleanupNotes(text)
  if (qtyFlagged) notes = prependFlag(notes, 'Qty not listed on import')
  if (!dims) notes = prependFlag(notes, `Could not parse size "${sizeRaw}"`)

  return {
    quantity,
    condition: condition.condition,
    bundleSize: '',
    zone: '',
    notes,
    length: dims?.length ?? 0,
    width: dims?.width ?? 0,
    channelCount: channel.channelCount,
    style: style.styles,
  }
}

export async function parseInventoryWorkbook(file: File): Promise<ImportParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const result: ImportParseResult = { uprights: [], beams: [], wireDecks: [], otherSkipped: 0 }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const qtyRaw = row[0]
    const itemRaw = String(row[1] ?? '').trim()
    const sizeRaw = String(row[2] ?? '').trim()
    const notesRaw = String(row[3] ?? '').trim()
    if (!itemRaw) continue

    const qtyFlagged = qtyRaw === '' || qtyRaw == null
    const quantity = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw) || 0

    const itemLower = itemRaw.toLowerCase()
    if (itemLower === 'upright') {
      result.uprights.push(buildUpright(quantity, qtyFlagged, sizeRaw, notesRaw))
    } else if (itemLower === 'beam') {
      result.beams.push(buildBeam(quantity, qtyFlagged, sizeRaw, notesRaw))
    } else if (itemLower === 'wire deck') {
      result.wireDecks.push(buildWireDeck(quantity, qtyFlagged, sizeRaw, notesRaw))
    } else {
      result.otherSkipped++
    }
  }

  return result
}
