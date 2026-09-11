import { useEffect, useState } from 'react'
import type { DriveEntry } from '../drive/store'

export function isPreviewable(entry: DriveEntry): boolean {
  return entry.mimeType.startsWith('image/') || entry.mimeType === 'application/pdf'
}

/** Drive's own viewer page, which it serves to the signed-in user for images and PDFs. */
function previewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`
}

export function PreviewModal({ entry, onClose }: { entry: DriveEntry; onClose: () => void }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal preview"
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="preview__bar">
          <h2 className="preview__title">{entry.name}</h2>
          <a
            className="preview__open"
            href={entry.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Drive
          </a>
          <button className="preview__close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {loading && <p className="preview__loading">Loading…</p>}
        <iframe
          className="preview__frame"
          src={previewUrl(entry.id)}
          title={entry.name}
          allow="autoplay"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}
