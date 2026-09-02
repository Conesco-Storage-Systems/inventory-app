import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BlobImage from '../components/BlobImage'
import PhotoCapture from '../components/PhotoCapture'
import { addProjectPhoto, deleteProjectPhoto, listProjectPhotos } from '../db/projectPhotos'

export default function ProjectImages() {
  const { siteId } = useParams<{ siteId: string }>()
  const photos = useLiveQuery(() => (siteId ? listProjectPhotos(siteId) : []), [siteId]) ?? []
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? null

  async function handleFilesChange(files: File[]) {
    if (!siteId) return
    for (const file of files) {
      await addProjectPhoto(siteId, file)
    }
    setPendingFiles([])
  }

  return (
    <main className="page">
      <p>
        <Link to={`/locations/${siteId}`}>← Back</Link>
      </p>
      <h1>Project Images</h1>

      <PhotoCapture files={pendingFiles} onChange={handleFilesChange} />

      {photos.length === 0 ? (
        <p className="placeholder-note">No project images yet.</p>
      ) : (
        <div className="photo-thumbnails photo-gallery">
          {photos.map((photo) => (
            <div
              className="photo-thumb photo-thumb-large photo-thumb-button"
              key={photo.id}
              onClick={() => setSelectedId(photo.id)}
            >
              <BlobImage blob={photo.blob} />
              <button
                type="button"
                className="photo-remove"
                onClick={async (e) => {
                  e.stopPropagation()
                  await deleteProjectPhoto(photo.id)
                }}
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
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
