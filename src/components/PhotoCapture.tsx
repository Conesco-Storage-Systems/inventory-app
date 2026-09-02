import { useEffect, useRef, useState } from 'react'
import BlobImage from './BlobImage'
import CameraCapture from './CameraCapture'
import { isMobileDevice } from '../utils/isMobileDevice'

interface PhotoCaptureProps {
  files: File[]
  onChange: (files: File[]) => void
}

export default function PhotoCapture({ files, onChange }: PhotoCaptureProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    if (newFiles.length > 0) onChange([...files, ...newFiles])
    e.target.value = ''
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

  return (
    <div className="photo-capture">
      {isMobileDevice ? (
        <div className="photo-add-wrapper">
          <button type="button" className="photo-add-button" onClick={() => fileInputRef.current?.click()}>
            + Add Photos
          </button>
          {fileInput}
        </div>
      ) : (
        <div className="photo-add-wrapper" ref={menuRef}>
          <button type="button" className="photo-add-button" onClick={() => setShowMenu(!showMenu)}>
            + Add Photos
          </button>
          {showMenu && (
            <div className="photo-add-menu">
              <button
                type="button"
                onClick={() => {
                  setShowCamera(true)
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
          {fileInput}
        </div>
      )}
      {files.length > 0 && (
        <div className="photo-thumbnails">
          {files.map((file, index) => (
            <PhotoThumbnail key={`${file.name}-${index}`} file={file} onRemove={() => removeAt(index)} />
          ))}
        </div>
      )}
      {showCamera && (
        <CameraCapture
          onCapture={(file) => onChange([...files, file])}
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
