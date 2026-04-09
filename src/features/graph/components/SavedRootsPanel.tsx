'use client'

import SkeletonImage from '@/components/SkeletonImage'
import type { SavedRootEntry } from '@/features/graph/app/store/types'

interface SavedRootsPanelProps {
  entries: SavedRootEntry[]
  isHydrated: boolean
  onDelete: (entry: SavedRootEntry) => void
  onSelect: (entry: SavedRootEntry) => void
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('es', {
  numeric: 'auto',
})

function getDisplayName(entry: SavedRootEntry) {
  return (
    entry.profile?.displayName ??
    entry.profile?.name ??
    'Identidad sin nombre'
  )
}

function getInitials(entry: SavedRootEntry) {
  const source = getDisplayName(entry)
  const segments = source
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return entry.npub.slice(0, 2).toUpperCase()
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join('')
}

function shortenNpub(npub: string) {
  return `${npub.slice(0, 12)}...${npub.slice(-6)}`
}

function formatSavedRootTime(timestamp: number) {
  const elapsedMs = timestamp - Date.now()
  const elapsedMinutes = Math.round(elapsedMs / 60_000)

  if (Math.abs(elapsedMinutes) < 60) {
    return relativeTimeFormatter.format(elapsedMinutes, 'minute')
  }

  const elapsedHours = Math.round(elapsedMs / 3_600_000)
  if (Math.abs(elapsedHours) < 24) {
    return relativeTimeFormatter.format(elapsedHours, 'hour')
  }

  const elapsedDays = Math.round(elapsedMs / 86_400_000)
  if (Math.abs(elapsedDays) < 7) {
    return relativeTimeFormatter.format(elapsedDays, 'day')
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(timestamp)
}

function renderSavedRootSkeleton(index: number) {
  return (
    <article className="saved-root-card saved-root-card--loading" key={`saved-root-skeleton-${index}`}>
      <div className="saved-root-card__select saved-root-card__select--loading">
        <div className="saved-root-card__avatar saved-root-card__avatar--fallback lc-skeleton-circle" />
        <div className="saved-root-card__content">
          <span className="saved-root-card__line lc-skeleton" />
          <span className="saved-root-card__line saved-root-card__line--short lc-skeleton" />
        </div>
      </div>
    </article>
  )
}

export function SavedRootsPanel({
  entries,
  isHydrated,
  onDelete,
  onSelect,
}: SavedRootsPanelProps) {
  if (!isHydrated && entries.length === 0) {
    return (
      <section className="saved-roots-panel" aria-label="Identidades guardadas">
        <div className="saved-roots-panel__header">
          <div>
            <p className="saved-roots-panel__eyebrow">Guardadas</p>
            <h3>Recuperando identidades</h3>
          </div>
        </div>
        <div className="saved-roots-grid">{Array.from({ length: 3 }, (_, index) => renderSavedRootSkeleton(index))}</div>
      </section>
    )
  }

  if (entries.length === 0) {
    return null
  }

  return (
    <section className="saved-roots-panel" aria-label="Identidades guardadas">
      <div className="saved-roots-panel__header">
        <div>
          <p className="saved-roots-panel__eyebrow">Guardadas</p>
          <h3>Elegi una identidad</h3>
        </div>
      </div>

      <div className="saved-roots-grid">
        {entries.map((entry) => {
          const displayName = getDisplayName(entry)
          const description = [
            entry.profile?.nip05,
            shortenNpub(entry.npub),
          ]
            .filter(Boolean)
            .join(' · ')
          const pictureAlt = `Avatar de ${displayName}`

          return (
            <article className="saved-root-card" key={entry.pubkey}>
              <button
                className="saved-root-card__select"
                onClick={() => onSelect(entry)}
                type="button"
              >
                <div className="saved-root-card__avatar">
                  {entry.profile?.picture ? (
                    <SkeletonImage
                      alt={pictureAlt}
                      className="object-cover"
                      fallback={
                        <div className="saved-root-card__avatar-fallback">
                          {getInitials(entry)}
                        </div>
                      }
                      sizes="80px"
                      src={entry.profile.picture}
                    />
                  ) : (
                    <div className="saved-root-card__avatar-fallback">
                      {getInitials(entry)}
                    </div>
                  )}
                </div>

                <div className="saved-root-card__content">
                  <div className="saved-root-card__title-row">
                    <p className="saved-root-card__name">{displayName}</p>
                    <span className="saved-root-card__stamp">
                      {formatSavedRootTime(entry.lastOpenedAt)}
                    </span>
                  </div>
                  <p className="saved-root-card__meta">{description}</p>
                  <p className="saved-root-card__npub">{entry.npub}</p>
                </div>
              </button>

              <button
                aria-label={`Eliminar ${displayName} de las identidades guardadas`}
                className="saved-root-card__delete"
                onClick={() => onDelete(entry)}
                type="button"
              >
                Quitar
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
