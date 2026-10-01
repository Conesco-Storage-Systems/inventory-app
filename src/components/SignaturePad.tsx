import { useEffect, useRef, useState } from 'react'

interface SignaturePadProps {
  title: string
  existingImage?: string
  onSave: (dataUrl: string) => void
  onCancel: () => void
  saving: boolean
}

const CANVAS_WIDTH = 500
const CANVAS_HEIGHT = 180

function fillWhite(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

export default function SignaturePad({ title, existingImage, onSave, onCancel, saving }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(!!existingImage)
  // Set only when Clear is used to wipe an existing signature — lets Save
  // commit that removal (a blank signature) instead of being stuck
  // disabled until something new is drawn, which was the only way out
  // before. Starting fresh (no existingImage) and clearing an empty
  // canvas has nothing to actually remove, so it doesn't enable Save.
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    fillWhite(ctx)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (existingImage) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      img.src = existingImage
    }
  }, [existingImage])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const rect = canvas!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    fillWhite(ctx)
    if (hasDrawn && existingImage) setCleared(true)
    setHasDrawn(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    if (hasDrawn) {
      onSave(canvas.toDataURL('image/png'))
    } else if (cleared) {
      onSave('')
    }
  }

  return (
    <div className="signature-pad-overlay">
      <div className="signature-pad-box">
        <h3>{title}</h3>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="signature-pad-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <p className="signature-pad-hint">Sign above with your mouse, finger, or stylus.</p>
        <div className="dialog-actions">
          <button type="button" onClick={handleClear} disabled={saving}>
            Clear Signature
          </button>
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || (!hasDrawn && !cleared)}>
            {saving ? 'Saving…' : hasDrawn ? 'Save Signature' : 'Save Blank'}
          </button>
        </div>
      </div>
    </div>
  )
}
