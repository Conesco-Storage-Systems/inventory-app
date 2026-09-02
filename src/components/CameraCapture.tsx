import { useEffect, useRef, useState } from 'react'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  onClose: () => void
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [multipleCameras, setMultipleCameras] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    streamRef.current?.getTracks().forEach((track) => track.stop())
    setError(null)

    async function start() {
      let stream: MediaStream
      try {
        // Ask for this exact camera first so "environment" reliably means the rear camera
        // when the device has one, instead of the browser picking whichever it likes.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: facingMode } },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
        })
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      const devices = await navigator.mediaDevices.enumerateDevices()
      if (cancelled) return
      const cameraCount = devices.filter((d) => d.kind === 'videoinput').length
      setMultipleCameras(cameraCount > 1)
    }

    start().catch(() => setError('Could not access the camera.'))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode])

  function handleCapture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        }
        onClose()
      },
      'image/jpeg',
      0.9,
    )
  }

  function handleFlip() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div className="camera-overlay">
      <button type="button" className="photo-viewer-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="camera-panel">
        {error ? (
          <p>{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        )}
        <div className="camera-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {!error && multipleCameras && (
            <button type="button" onClick={handleFlip}>
              Flip Camera
            </button>
          )}
          <button type="button" onClick={handleCapture} disabled={!!error}>
            Capture
          </button>
        </div>
      </div>
    </div>
  )
}
