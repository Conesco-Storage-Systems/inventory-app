import JSZip from 'jszip'
import type { BeamRow } from '../db/groupBeams'
import { groupBeams } from '../db/groupBeams'
import type { MiscItemRow } from '../db/groupMiscItems'
import { groupMiscItems } from '../db/groupMiscItems'
import type { UprightRow } from '../db/groupUprights'
import { groupUprights } from '../db/groupUprights'
import type { WireDeckRow } from '../db/groupWireDecks'
import { groupWireDecks } from '../db/groupWireDecks'
import { getPhotosForItem, listBeamsBySite, listMiscItemsBySite, listUprightsBySite, listWireDecksBySite } from '../db/items'
import { listProjectPhotos } from '../db/projectPhotos'
import type { Site } from '../models/types'

function sanitizeFileName(text: string): string {
  const cleaned = text.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 60) || 'item'
}

function blobExtension(blob: Blob): string {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/webp') return 'webp'
  return 'jpg'
}

function describeUpright(row: UprightRow): string {
  return [row.style, row.widthByHeight, row.color, row.gauge && `${row.gauge}ga`, row.condition]
    .filter(Boolean)
    .join(' ')
}

function describeBeam(row: BeamRow): string {
  return [row.style, row.widthByLength, row.color, row.pinCount && `${row.pinCount}pin`, row.condition]
    .filter(Boolean)
    .join(' ')
}

function describeWireDeck(row: WireDeckRow): string {
  return [row.style.join('-'), row.widthByLength, row.condition].filter(Boolean).join(' ')
}

function describeMisc(row: MiscItemRow): string {
  return [row.description, row.condition].filter(Boolean).join(' ')
}

/**
 * Bundles every photo for a location — the site's own hero photo, its
 * "additional site photos" gallery, and every item's photos — into one
 * downloadable zip, organized into folders by category. Meant for
 * quickly handing a location's photos to someone outside the app (e.g.
 * dropping them into a shared Google Drive folder) before the app itself
 * is ready to share.
 */
export async function exportSitePhotosZip(site: Site, siteId: string): Promise<number> {
  const zip = new JSZip()
  let fileCount = 0

  if (site.sitePhoto) {
    fileCount++
    zip.file(`Site Photo/site-photo.${blobExtension(site.sitePhoto)}`, site.sitePhoto)
  }

  const additionalPhotos = await listProjectPhotos(siteId)
  additionalPhotos.forEach((photo, i) => {
    fileCount++
    zip.folder('Additional Site Photos')!.file(`photo-${i + 1}.${blobExtension(photo.blob)}`, photo.blob)
  })

  async function addGroup<T extends { ids: string[] }>(
    folder: string,
    rows: T[],
    describe: (row: T) => string,
  ) {
    for (const row of rows) {
      const photos = await getPhotosForItem(row.ids)
      if (photos.length === 0) continue
      const label = sanitizeFileName(describe(row))
      photos.forEach((photo, i) => {
        fileCount++
        zip.folder(folder)!.file(`${label} (${i + 1}).${blobExtension(photo.blob)}`, photo.blob)
      })
    }
  }

  await addGroup('Uprights', groupUprights(await listUprightsBySite(siteId)), describeUpright)
  await addGroup('Beams', groupBeams(await listBeamsBySite(siteId)), describeBeam)
  await addGroup('Wire Decks', groupWireDecks(await listWireDecksBySite(siteId)), describeWireDeck)
  await addGroup('Other', groupMiscItems(await listMiscItemsBySite(siteId)), describeMisc)

  if (fileCount === 0) {
    throw new Error('No photos found for this location.')
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const fileName = `${site.name.replace(/[^a-z0-9]+/gi, '-')}-photos.zip`
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return fileCount
}
