import { useEffect, useState } from 'react'
import { SYNC_ERROR_EVENT, getLastSyncError } from '../sync/syncEngine'

export default function SyncErrorBanner() {
  const [message, setMessage] = useState<string | null>(() => getLastSyncError())

  useEffect(() => {
    function handleSyncError(event: Event) {
      setMessage((event as CustomEvent<string>).detail)
    }
    window.addEventListener(SYNC_ERROR_EVENT, handleSyncError)
    return () => window.removeEventListener(SYNC_ERROR_EVENT, handleSyncError)
  }, [])

  if (!message) return null

  return (
    <div className="sync-error-banner">
      <span>Sync problem: {message}</span>
      <button type="button" className="sync-error-dismiss" onClick={() => setMessage(null)}>
        ✕
      </button>
    </div>
  )
}
