import * as XLSX from 'xlsx'
import type { NewBeamInput, NewMiscItemInput, NewUprightInput, NewWireDeckInput } from '../db/items'
import type { Condition } from '../models/types'

type ParsedUpright = Omit<NewUprightInput, 'siteId' | 'photoFiles'>
type ParsedBeam = Omit<NewBeamInput, 'siteId' | 'photoFiles'>
type ParsedWireDeck = Omit<NewWireDeckInput, 'siteId' | 'photoFiles'>
type ParsedMiscItem = Omit<NewMiscItemInput, 'siteId' | 'photoFiles'>

export interface ImportParseResult {
  uprights: ParsedUpright[]
  beams: ParsedBeam[]
  wireDecks: ParsedWireDeck[]
  miscItems: ParsedMiscItem[]
  // Rows with a real item name but nothing left in stock (Quantity Remaining
  // is 0) — everything already sold/shipped, so there's nothing current to
  // bring in.
  soldOutSkipped: number
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

// 'red' was missing until we saw it in real data ("red & orange" beams) —
// add more colors here only once a real sheet needs them, same reasoning.
const COLOR_WORDS = ['orange', 'green', 'blue', 'red', 'gray', 'grey']

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

function extractGauge(text: string): { gauge: string; remaining: string } {
  const m = text.match(/(\d+)\s*ga\b/i)
  if (m) return { gauge: m[1], remaining: text.replace(m[0], ' ') }
  return { gauge: '', remaining: text }
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
  // Free text, kept exactly as written on the sheet — usually a single
  // height like "12'" or "12' 6"", but a cut/repaired upright is
  // sometimes a range like "8' - 10'" or "19'6" - 20'", which is common
  // enough here to just carry through as-is rather than treat as an error.
  height: string
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

  const height = parts[1]
  if (!height) return null

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

  return { width, height, columnLength, columnWidth }
}

// Real beam "Size" cells carry a 3rd " x "-separated segment for the step —
// e.g. `3.75" - 4" x 96" x 1-5/8"` — which lines up exactly with the beam
// step dropdown's own option text, so it's captured verbatim rather than
// dropped.
function parseBeamSize(sizeRaw: string): { width: string; length: number; step: string } | null {
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

  const step = parts.length >= 3 ? parts[2] : ''

  return { width, length, step }
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

function buildUpright(
  quantity: number,
  qtyFlagged: boolean,
  sizeRaw: string,
  notesRaw: string,
  costPer: number,
  sellPer: number,
): ParsedUpright {
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
  const gauge = extractGauge(text)
  text = gauge.remaining
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
    height: dims?.height ?? '',
    columnLength: dims?.columnLength ?? 0,
    columnWidth: dims?.columnWidth ?? 0,
    footplateLength: fp.length ?? 0,
    footplateWidth: fp.width ?? 0,
    anchorHoleCount: holes.count ?? 0,
    holeSize: holes.size,
    gauge: gauge.gauge,
    stamp: '',
    costPer,
    sellPer,
  }
}

function buildBeam(
  quantity: number,
  qtyFlagged: boolean,
  sizeRaw: string,
  notesRaw: string,
  costPer: number,
  sellPer: number,
): ParsedBeam {
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
    step: dims?.step ?? '',
    costPer,
    sellPer,
  }
}

function buildWireDeck(
  quantity: number,
  qtyFlagged: boolean,
  sizeRaw: string,
  notesRaw: string,
  costPer: number,
  sellPer: number,
): ParsedWireDeck {
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
    costPer,
    sellPer,
  }
}

// Everything that isn't an Upright/Beam/Wire Deck — Pallet Support, Row
// Spacer, Column Protector, Monopost, conveyors, carts, forklifts,
// shelving, etc. — lands here. The original "Item" label is kept verbatim
// as the description so nothing is silently relabeled or lost.
function buildMiscItem(
  itemLabel: string,
  quantity: number,
  qtyFlagged: boolean,
  sizeRaw: string,
  notesRaw: string,
  costPer: number,
  sellPer: number,
): ParsedMiscItem {
  const condition = extractCondition(notesRaw)
  const leftoverNotes = cleanupNotes(condition.remaining)
  const itemDescription = [sizeRaw.trim(), leftoverNotes].filter(Boolean).join(' — ')

  let notes = ''
  if (qtyFlagged) notes = prependFlag(notes, 'Qty not listed on import')

  return {
    quantity,
    condition: condition.condition,
    bundleSize: '',
    zone: '',
    notes,
    description: itemLabel,
    itemDescription,
    costPer,
    sellPer,
  }
}

type ItemKind = 'upright' | 'beam' | 'wireDeck' | 'misc'

// "Monopost" is a real, recurring upright variant in these sheets, but per
// Corbett's call it's filed under Misc/Other rather than the structured
// Uprights table — everything except an exact "Upright"/"Beam"/"Wire Deck"
// match falls through to Misc, so no special-casing is needed here.
function classifyItem(itemRaw: string): ItemKind {
  const v = itemRaw.trim().toLowerCase()
  if (v === 'upright' || v === 'uprights') return 'upright'
  if (v === 'beam' || v === 'beams') return 'beam'
  if (v === 'wire deck' || v === 'wiredeck' || v === 'wire decks') return 'wireDeck'
  return 'misc'
}

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// These consolidated-inventory workbooks bury the real header row under a
// few rows of site metadata (name/address/contacts) plus a running-totals
// row — so it's found by content rather than assumed to be a fixed row
// index. "Item" + "Quantity Remaining" together are specific enough that
// job-costing tabs (a completely different layout) or a wrong sheet won't
// false-match.
function findHeaderRowIndex(rows: unknown[][]): number {
  const searchLimit = Math.min(rows.length, 25)
  for (let i = 0; i < searchLimit; i++) {
    const normalized = rows[i].map(normalizeHeader)
    if (normalized.includes('item') && normalized.includes('quantity remaining')) return i
  }
  return -1
}

function buildColumnMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

export async function getWorkbookSheetNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames
}

export async function parseInventoryWorkbook(file: File, sheetName: string): Promise<ImportParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" was not found in this file.`)

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headerRowIndex = findHeaderRowIndex(rows)
  if (headerRowIndex === -1) {
    throw new Error(
      'Could not find the expected columns ("Item", "Quantity Remaining", etc.) on this sheet. Try a different tab.',
    )
  }

  const columns = buildColumnMap(rows[headerRowIndex])
  const itemCol = columns.get('item')
  const sizeCol = columns.get('size')
  const commentsCol = columns.get('type / comments') ?? columns.get('comments')
  const quantityCol = columns.get('quantity remaining')
  const costPerCol = columns.get('cost per')
  const sellPerCol = columns.get('end user sell per') ?? columns.get('sell per')

  if (itemCol === undefined || quantityCol === undefined) {
    throw new Error(
      'Could not find the expected columns ("Item", "Quantity Remaining") on this sheet. Try a different tab.',
    )
  }

  function cellText(row: unknown[], col: number | undefined): string {
    if (col === undefined) return ''
    return String(row[col] ?? '').trim()
  }

  function cellNumber(row: unknown[], col: number | undefined): number {
    if (col === undefined) return 0
    const raw = row[col]
    return typeof raw === 'number' ? raw : Number(raw) || 0
  }

  const result: ImportParseResult = { uprights: [], beams: [], wireDecks: [], miscItems: [], soldOutSkipped: 0 }

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    const itemRaw = cellText(row, itemCol)
    if (!itemRaw) continue

    const quantityRaw = quantityCol !== undefined ? row[quantityCol] : ''
    const qtyFlagged = quantityRaw === '' || quantityRaw == null
    const quantity = cellNumber(row, quantityCol)

    // Already fully sold/shipped (0) or a negative-adjustment line with
    // nothing physically here (a real value in these sheets, but not a
    // thing a physical inventory count can represent) — nothing current
    // to bring in either way.
    if (!qtyFlagged && quantity <= 0) {
      result.soldOutSkipped++
      continue
    }

    const sizeRaw = cellText(row, sizeCol)
    const commentsRaw = cellText(row, commentsCol)
    const costPer = cellNumber(row, costPerCol)
    const sellPer = cellNumber(row, sellPerCol)

    const kind = classifyItem(itemRaw)
    if (kind === 'upright') {
      result.uprights.push(buildUpright(quantity, qtyFlagged, sizeRaw, commentsRaw, costPer, sellPer))
    } else if (kind === 'beam') {
      result.beams.push(buildBeam(quantity, qtyFlagged, sizeRaw, commentsRaw, costPer, sellPer))
    } else if (kind === 'wireDeck') {
      result.wireDecks.push(buildWireDeck(quantity, qtyFlagged, sizeRaw, commentsRaw, costPer, sellPer))
    } else {
      result.miscItems.push(buildMiscItem(itemRaw, quantity, qtyFlagged, sizeRaw, commentsRaw, costPer, sellPer))
    }
  }

  return result
}
