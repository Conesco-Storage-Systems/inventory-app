import { useEffect, useRef, useState } from 'react'
import BlobImage from './BlobImage'
import CameraCapture from './CameraCapture'
import { compressImageToFile } from '../export/compressImage'
import { isMobileDevice } from '../utils/isMobileDevice'

interface PhotoCaptureProps {
  files: File[]
  onChange: (files: File[]) => void
}

export default function PhotoCapture({ files, onChange }: PhotoCaptureProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // These files can sit in memory for a while — the whole rest of however
  // long an item form stays open, across however many more photos get
  // taken — before savePhotos() ever compresses them. On iOS, a camera
  // capture's raw File can be a lazy handle onto a reusable OS buffer, so
  // the longer an uncompressed File sits around while more photos get
  // taken, the more likely a later capture silently overwrites an earlier
  // one's data. Compressing right here, the moment each file arrives,
  // keeps that window as close to zero as possible instead of leaving it
  // open for the rest of the form session.
  async function addFiles(newFiles: File[]) {
    const compressed = await Promise.all(newFiles.map((file) => compressImageToFile(file).catch(() => file)))
    onChange([...files, ...compressed])
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (newFiles.length > 0) void addFiles(newFiles)
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={handleFilesSelected}
      className="photo-file-input"
    />
  )

  // A plain file input with no `capture` attribute leaves it up to the
  // device's own chooser to decide whether "camera" is even offered as an
  // option — iOS Safari reliably includes it, but it's inconsistent across
  // Android versions/manufacturers/browsers. Setting `capture` explicitly
  // forces the camera app open directly on both platforms instead of
  // gambling on the generic chooser.
  const cameraInput = isMobileDevice ? (
    <input
      ref={cameraInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      onChange={handleFilesSelected}
      className="photo-file-input"
    />
  ) : null

  return (
    <div className="photo-capture">
      <div className="photo-add-wrapper" ref={menuRef}>
        <button type="button" className="photo-add-button" onClick={() => setShowMenu(!showMenu)}>
          + Add Photos
        </button>
        {showMenu && (
          <div className="photo-add-menu">
            <button
              type="button"
              onClick={() => {
                if (isMobileDevice) {
                  cameraInputRef.current?.click()
                } else {
                  setShowCamera(true)
                }
                setShowMenu(false)
              }}
            >
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click()
                setShowMenu(false)
              }}
            >
              Add From Files
            </button>
          </div>
        )}
        {cameraInput}
        {fileInput}
      </div>
      {files.length > 0 && (
        <div className="photo-thumbnails">
          {files.map((file, index) => (
            <PhotoThumbnail key={`${file.name}-${index}`} file={file} onRemove={() => removeAt(index)} />
          ))}
        </div>
      )}
      {showCamera && (
        <CameraCapture
          onCapture={(file) => void addFiles([file])}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}

function PhotoThumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="photo-thumb">
      <BlobImage blob={file} />
      <button type="button" className="photo-remove" onClick={onRemove} aria-label="Remove photo">
        ×
      </button>
    </div>
  )
}
