import { useRef, useState } from 'react'
import { setSalesOrderSchedule } from '../db/salesOrders'

interface ScheduleShipmentDialogProps {
  soNumber: string
  siteId: string
  siteName: string
  currentDate: string
}

export default function ScheduleShipmentDialog({ soNumber, siteId, siteName, currentDate }: ScheduleShipmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [date, setDate] = useState(currentDate)
  const [saving, setSaving] = useState(false)

  function open() {
    setDate(currentDate)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    try {
      await setSalesOrderSchedule(soNumber, siteId, siteName, date)
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open}>
        {currentDate ? 'Reschedule Shipment' : 'Schedule Shipment'}
      </button>
      <dialog ref={dialogRef} className="location-dialog">
        <form onSubmit={handleSubmit}>
          <h2>Schedule Shipment</h2>
          <label>
            Ship date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
          </label>
          <div className="dialog-actions">
            <button type="button" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !date}>
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
