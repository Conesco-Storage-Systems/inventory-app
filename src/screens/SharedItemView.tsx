import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../sync/supabaseClient'

interface SharedField {
  label: string
  value: string
}

interface SharedItemData {
  itemLabel: string
  fields: SharedField[]
  photoUrls: string[]
}

// Public, unauthenticated view for a single Excel-exported "View Online"
// link. Fetches from the shared-item Edge Function (service-role, returns
// only a fixed safe field set — never pricing) rather than the local Dexie
// database, since a visitor here has no session and no local data at all.
// Its own `.shared-item-*` classes — a plain web layout, not the
// `.cs-*` "paper sheet" look the customer-sheet PDF preview uses.
export default function SharedItemView() {
  const { itemType, ids } = useParams<{ itemType: string; ids: string }>()
  const [data, setData] = useState<SharedItemData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      const idList = (ids ?? '').split(',').filter(Boolean)
      if (!itemType || idList.length === 0) {
        setStatus('not-found')
        return
      }

      const { data: result, error } = await supabase.functions.invoke('shared-item', {
        body: { itemType, ids: idList },
      })
      if (cancelled) return

      if (error || !result || result.error) {
        setStatus(error?.context?.status === 404 || result?.error === 'Not found' ? 'not-found' : 'error')
        return
      }

      setData(result as SharedItemData)
      setStatus('ready')
    }

    load()
    return () => {
      cancelled = true
    }
  }, [itemType, ids])

  if (status === 'loading') {
    return (
      <main className="page">
        <p>Loading…</p>
      </main>
    )
  }

  if (status === 'not-found') {
    return (
      <main className="page">
        <p>This item couldn't be found — it may have been removed.</p>
      </main>
    )
  }

  if (status === 'error' || !data) {
    return (
      <main className="page">
        <p>Something went wrong loading this item. Please try again later.</p>
      </main>
    )
  }

  return (
    <main className="shared-item-page">
      <div className="shared-item-header">
        <img src="/conesco-logo.png" alt="Conesco" className="shared-item-logo" />
      </div>

      <h1 className="shared-item-title">{data.itemLabel}</h1>

      {data.fields.length > 0 && (
        <div className="shared-item-fields-row">
          {data.fields.map((field, i) => (
            <div className="shared-item-field" key={i}>
              <span className="shared-item-field-label">{field.label}</span>
              <span className="shared-item-field-value">{field.value}</span>
            </div>
          ))}
        </div>
      )}

      {data.photoUrls.length > 0 && (
        <div className="shared-item-photos">
          {data.photoUrls.map((url, i) => (
            <button
              type="button"
              className="shared-item-photo-button"
              key={i}
              onClick={() => setSelectedPhotoUrl(url)}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}

      <p className="shared-item-footer">© Conesco Storage Systems, Inc. — www.CONESCO.com</p>

      {selectedPhotoUrl && (
        <div className="photo-viewer-overlay" onClick={() => setSelectedPhotoUrl(null)}>
          <button
            type="button"
            className="photo-viewer-close"
            onClick={() => setSelectedPhotoUrl(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="photo-viewer-image" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhotoUrl} alt="" />
          </div>
        </div>
      )}
    </main>
  )
}
