import { useEffect, useState } from 'react'

export default function BlobImage({ blob, alt = '' }: { blob: Blob; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!url) return null
  return <img src={url} alt={alt} />
}
