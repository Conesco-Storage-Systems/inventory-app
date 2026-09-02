import { useEffect, useRef, useState } from 'react'
import BlobImage from './BlobImage'
import CameraCapture from './CameraCapture'
import { isMobileDevice } from '../utils/isMobileDevice'

interface SitePhotoPickerProps {
  photo?: Blob
  alt: string
  onSelect: (file: File) => void
}

export default function SitePhotoPicker({ photo, alt, onSelect }: SitePhotoPickerProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        (wrapperRef.current && wrapperRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return
      }
      setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onSelect(file)
    e.target.value = ''
    setShowMenu(false)
    setShowViewer(false)
  }

  function handlePhotoCaptured(file: File) {
    onSelect(file)
    setShowCamera(false)
    setShowMenu(false)
    setShowViewer(false)
  }

  function handleTriggerClick() {
    if (photo) {
      setShowViewer(true)
      return
    }
    if (isMobileDevice) {
      fileInputRef.current?.click()
    } else {
      setShowMenu(!showMenu)
    }
  }

  function handleReplaceClick() {
    if (isMobileDevice) {
      fileInputRef.current?.click()
    } else {
      setShowMenu(!showMenu)
    }
  }

  function closeViewer() {
    setShowViewer(false)
    setShowMenu(false)
  }

  return (
    <div className="site-photo-picker" ref={wrapperRef}>
      <button type="button" className="site-photo-button" onClick={handleTriggerClick}>
        {photo ? (
          <BlobImage blob={photo} alt={alt} />
        ) : (
          <span className="site-photo-placeholder">+ Add site photo</span>
        )}
      </button>

      {!photo && !isMobileDevice && showMenu && (
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFilesSelected}
        className="photo-file-input"
      />

      {showViewer && photo && (
        <div className="photo-viewer-overlay" onClick={closeViewer}>
          <div className="photo-viewer-image site-photo-viewer-content" onClick={(e) => e.stopPropagation()}>
            <div className="site-photo-viewer-frame">
              <button
                type="button"
                className="site-photo-viewer-close"
                onClick={closeViewer}
                aria-label="Close"
              >
                ×
              </button>
              <BlobImage blob={photo} alt={alt} />
            </div>
            <div className="site-photo-viewer-actions">
              <div className="photo-add-wrapper" ref={menuRef}>
                <button type="button" onClick={handleReplaceClick}>
                  Replace Photo
                </button>
                {!isMobileDevice && showMenu && (
                  <div className="photo-add-menu photo-add-menu-up">
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
              </div>
            </div>
          </div>
        </div>
      )}

      {showCamera && <CameraCapture onCapture={handlePhotoCaptured} onClose={() => setShowCamera(false)} />}
    </div>
  )
}
