import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import BlobImage from '../components/BlobImage'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import PhotoCapture from '../components/PhotoCapture'
import {
  addBulletinPostPhoto,
  createBulletinComment,
  createBulletinPost,
  deleteBulletinComment,
  deleteBulletinPost,
  listBulletinCommentsByPost,
  listBulletinPostPhotos,
  listBulletinPosts,
} from '../db/bulletinBoard'
import type { BulletinPost } from '../models/types'
import { useRole } from '../state/RoleContext'
import { formatDisplayName } from '../utils/displayName'

function formatPostedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function PostPhotos({ postId }: { postId: string }) {
  const photos = useLiveQuery(() => listBulletinPostPhotos(postId), [postId]) ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedPhoto = photos.find((photo) => photo.id === selectedId) ?? null

  if (photos.length === 0) return null

  return (
    <>
      <div className="photo-thumbnails">
        {photos.map((photo) => (
          <div key={photo.id} className="photo-thumb photo-thumb-button" onClick={() => setSelectedId(photo.id)}>
            <BlobImage blob={photo.blob} />
          </div>
        ))}
      </div>
      {selectedPhoto && (
        <div className="photo-viewer-overlay" onClick={() => setSelectedId(null)}>
          <button type="button" className="photo-viewer-close" onClick={() => setSelectedId(null)} aria-label="Close">
            ×
          </button>
          <div className="photo-viewer-image" onClick={(e) => e.stopPropagation()}>
            <BlobImage blob={selectedPhoto.blob} />
          </div>
        </div>
      )}
    </>
  )
}

function PostComments({ postId }: { postId: string }) {
  const comments = useLiveQuery(() => listBulletinCommentsByPost(postId), [postId]) ?? []
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    try {
      await createBulletinComment(postId, body)
      setDraft('')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bulletin-comments">
      {comments.map((comment) => (
        <div key={comment.id} className="bulletin-comment">
          <div className="bulletin-comment-meta">
            <strong>{formatDisplayName(comment.authorEmail)}</strong>
            <span className="placeholder-note">{formatPostedAt(comment.createdAt)}</span>
            <button type="button" className="link-button" onClick={() => deleteBulletinComment(comment.id)}>
              Delete
            </button>
          </div>
          <p className="bulletin-body">{comment.body}</p>
        </div>
      ))}
      <form className="bulletin-comment-form" onSubmit={handleAddComment}>
        <input
          type="text"
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={posting || !draft.trim()}>
          {posting ? 'Posting…' : 'Comment'}
        </button>
      </form>
    </div>
  )
}

function PostCard({ post }: { post: BulletinPost }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="item-section bulletin-post">
      <div className="bulletin-post-meta">
        <strong>{formatDisplayName(post.authorEmail)}</strong>
        <span className="placeholder-note">{formatPostedAt(post.createdAt)}</span>
        <button type="button" className="delete-button" onClick={() => setConfirmingDelete(true)}>
          Delete
        </button>
      </div>
      <p className="bulletin-body">{post.body}</p>
      <PostPhotos postId={post.id} />
      <PostComments postId={post.id} />

      {confirmingDelete && (
        <ConfirmDeleteDialog
          onConfirm={() => deleteBulletinPost(post.id)}
          onClose={() => setConfirmingDelete(false)}
          message="Delete this post? Its comments and photos will be deleted too."
        />
      )}
    </div>
  )
}

export default function BulletinBoard() {
  const { permissions } = useRole()
  const posts = useLiveQuery(() => listBulletinPosts(), []) ?? []
  const [draftBody, setDraftBody] = useState('')
  const [draftPhotos, setDraftPhotos] = useState<File[]>([])
  const [posting, setPosting] = useState(false)

  if (!permissions.viewBulletinBoard) {
    return (
      <main className="page">
        <p>
          <Link to="/">← Back</Link>
        </p>
        <p>Your role doesn't have permission to view this page.</p>
      </main>
    )
  }

  async function handleNewPost(e: React.FormEvent) {
    e.preventDefault()
    const body = draftBody.trim()
    if (!body) return
    setPosting(true)
    try {
      const postId = await createBulletinPost(body)
      for (const file of draftPhotos) await addBulletinPostPhoto(postId, file)
      setDraftBody('')
      setDraftPhotos([])
    } finally {
      setPosting(false)
    }
  }

  return (
    <main className="page page-wide">
      <p>
        <Link to="/">← Back</Link>
      </p>
      <h1>Bulletin Board</h1>

      <form className="item-section bulletin-new-post" onSubmit={handleNewPost}>
        <textarea
          placeholder="Share a note, idea, or plan…"
          rows={4}
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
        />
        <PhotoCapture files={draftPhotos} onChange={setDraftPhotos} />
        <p>
          <button type="submit" disabled={posting || !draftBody.trim()}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </p>
      </form>

      {posts.length === 0 ? (
        <p className="placeholder-note">Nothing posted yet — be the first to start a thread.</p>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </main>
  )
}
