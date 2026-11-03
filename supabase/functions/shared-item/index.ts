// Public, unauthenticated endpoint backing the "View Online" links embedded
// in Excel exports. This is the ONLY place in the system that may expose
// inventory data without a login, so it deliberately duplicates its own
// safe-field list rather than importing anything from the authenticated
// app — its security boundary must not depend on what the app happens to
// display elsewhere. In particular it must NEVER return cost_per/sell_per.
//
// Runs with the service-role key (auto-injected by Supabase as
// SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS entirely — this function
// is what enforces "only the row(s) asked for, only these columns" as a
// hard rule, since an RLS policy can't restrict access to "whichever id is
// in this URL."
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PHOTO_BUCKET = 'inventory-photos'
// Fine even for a link opened months later — this function re-runs and
// mints fresh signed URLs on every single page view, so a short TTL here
// never makes the link itself go stale.
const SIGNED_URL_TTL_SECONDS = 60 * 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ItemType = 'beam' | 'upright' | 'wireDeck' | 'misc'

const TABLE_NAMES: Record<ItemType, string> = {
  beam: 'beams',
  upright: 'uprights',
  wireDeck: 'wire_decks',
  misc: 'misc_items',
}

const ITEM_LABELS: Record<ItemType, string> = {
  beam: 'Used Beams',
  upright: 'Used Uprights',
  wireDeck: 'Used Wire Decks',
  misc: 'Other',
}

interface Field {
  label: string
  value: string
}

// Mirrors the vocabulary in src/db/itemFields.ts's getItemFields/getFieldDefs
// — same labels, same fields, deliberately re-implemented here rather than
// shared, so a future change to the authenticated app's display logic can't
// silently change what this public endpoint exposes.
// Quantity and Zone are deliberately never included here — both are
// expected to be edited/tracked separately after export (quantity directly
// in the sheet, zone as warehouse placement changes), and showing a live
// value that could differ from what's in the sheet would read as a
// discrepancy rather than the two simply being tracked independently.
function buildFields(itemType: ItemType, row: Record<string, unknown>): Field[] {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const fields: Field[] = []

  if (itemType === 'beam') {
    fields.push(
      { label: 'Style', value: s(row.style) },
      { label: 'Width x Length', value: `${s(row.width)} x ${s(row.length)}` },
      { label: 'Color', value: s(row.color) },
      { label: 'Pin Count', value: s(row.pin_count) },
      { label: 'Step', value: s(row.step) },
      { label: 'Condition', value: s(row.condition) },
      { label: 'Stamp', value: s(row.stamp) },
      { label: 'Stickers', value: s(row.stickers) },
      { label: 'Bundle Size', value: s(row.bundle_size) },
      { label: 'Notes', value: s(row.notes) },
    )
  } else if (itemType === 'upright') {
    const columnSize = `${s(row.column_length)}" x ${s(row.column_width)}"`
    const footplateSize = row.footplate_length || row.footplate_width ? `${s(row.footplate_length)}" x ${s(row.footplate_width)}"` : ''
    fields.push(
      { label: 'Style', value: s(row.style) },
      { label: 'Width x Height', value: `${s(row.width)}" x ${s(row.height)}` },
      { label: 'Color', value: s(row.color) },
      { label: 'Column Size', value: columnSize },
      { label: 'Footplate Size', value: footplateSize },
      { label: 'Footplate Thickness', value: s(row.footplate_thickness) },
      { label: 'Anchor Hole Count', value: s(row.anchor_hole_count) },
      { label: 'Hole Size', value: s(row.hole_size) },
      { label: 'Gauge', value: s(row.gauge) },
      { label: 'Condition', value: s(row.condition) },
      { label: 'Stamp', value: s(row.stamp) },
      { label: 'Bundle Size', value: s(row.bundle_size) },
      { label: 'Notes', value: s(row.notes) },
    )
  } else if (itemType === 'wireDeck') {
    const style = Array.isArray(row.style) ? (row.style as string[]).join(', ') : s(row.style)
    fields.push(
      { label: 'Style', value: style },
      { label: 'Width x Length', value: `${s(row.width)} x ${s(row.length)}` },
      { label: 'Number of Channels', value: s(row.channel_count) },
      { label: 'Condition', value: s(row.condition) },
      { label: 'Bundle Size', value: s(row.bundle_size) },
      { label: 'Notes', value: s(row.notes) },
    )
  } else {
    fields.push(
      { label: 'Item', value: s(row.description) },
      { label: 'Item Description', value: s(row.item_description) },
      { label: 'Condition', value: s(row.condition) },
      { label: 'Bundle Size', value: s(row.bundle_size) },
      { label: 'Notes', value: s(row.notes) },
    )
  }

  return fields.filter((f) => f.value)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let itemType: ItemType
  let ids: string[]
  try {
    const body = await req.json()
    itemType = body.itemType
    ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string' && id) : []
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const tableName = TABLE_NAMES[itemType]
  if (!tableName || ids.length === 0) {
    return jsonResponse({ error: 'Invalid itemType or ids' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: rows, error } = await supabase.from(tableName).select('*').in('id', ids)
  if (error) return jsonResponse({ error: 'Lookup failed' }, 500)
  if (!rows || rows.length === 0) return jsonResponse({ error: 'Not found' }, 404)

  const fields = buildFields(itemType, rows[0])

  let locationField: Field | null = null
  const siteId = rows[0].site_id
  if (siteId) {
    const { data: site } = await supabase.from('sites').select('name').eq('id', siteId).maybeSingle()
    if (site?.name) locationField = { label: 'Location', value: site.name }
  }

  const { data: photoRows } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('item_type', itemType)
    .in('item_id', ids)

  const photoUrls: string[] = []
  for (const photo of photoRows ?? []) {
    const { data: signed } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS)
    if (signed?.signedUrl) photoUrls.push(signed.signedUrl)
  }

  const miscLabel = itemType === 'misc' ? String(rows[0].description ?? '') : ''
  return jsonResponse({
    itemLabel: miscLabel || ITEM_LABELS[itemType],
    fields: locationField ? [...fields, locationField] : fields,
    photoUrls,
  })
})
