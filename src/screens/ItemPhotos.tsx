import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BlobImage from '../components/BlobImage'
import { getPhotosForItem } from '../db/items'

export default function ItemPhotos() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get('ids') ?? ''
  const ids = idsParam.split(',').filter(Boolean)

  const photos = useLiveQuery(() => getPhotosForItem(ids), [idsParam]) ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? null

  return (
    <main className="page">
      <p>
        <button type="button" className="link-button" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </p>
      <h1>Photos</h1>

      {photos.length === 0 ? (
        <p>No photos attached.</p>
      ) : (
        <div className="photo-thumbnails photo-gallery">
          {photos.map((photo) => (
            <button
              type="button"
              className="photo-thumb photo-thumb-large photo-thumb-button"
              key={photo.id}
              onClick={() => setSelectedId(photo.id)}
            >
              <BlobImage blob={photo.blob} />
            </button>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div className="photo-viewer-overlay" onClick={() => setSelectedId(null)}>
          <button
            type="button"
            className="photo-viewer-close"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="photo-viewer-image" onClick={(e) => e.stopPropagation()}>
            <BlobImage blob={selectedPhoto.blob} />
          </div>
        </div>
      )}
    </main>
  )
}
