/* eslint-disable react-hooks/set-state-in-effect */
import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { AppStore } from '@/features/graph/app/store/types'

interface RelationshipToggleState {
  following: boolean
  followers: boolean
  onlyNonReciprocal: boolean
}

interface GraphControlRailProps {
  activeLayer: AppStore['activeLayer']
  relationshipToggleState: RelationshipToggleState
  canToggleOnlyNonReciprocal: boolean
  onlyOneRelationshipSideActive: boolean
  keywordLayerDisabledReason: string
  zapLayerStatus: AppStore['zapLayer']['status']
  onToggleLayer: (layer: AppStore['activeLayer']) => void
  onToggleRelationship: (role: 'following' | 'followers') => void
  onToggleOnlyNonReciprocal: () => void
  keywordSearch?: ReactNode
}

function useIsCompact() {
  const [isCompact, setIsCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsCompact(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsCompact(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isCompact
}

export const GraphControlRail = memo(function GraphControlRail({
  activeLayer,
  relationshipToggleState,
  canToggleOnlyNonReciprocal,
  onlyOneRelationshipSideActive,
  keywordLayerDisabledReason,
  zapLayerStatus,
  onToggleLayer,
  onToggleRelationship,
  onToggleOnlyNonReciprocal,
  keywordSearch,
}: GraphControlRailProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const isCompact = useIsCompact()
  const moreRef = useRef<HTMLDivElement>(null)

  const isNonReciprocalAvailable =
    canToggleOnlyNonReciprocal && onlyOneRelationshipSideActive
  const isNonReciprocalActive =
    isNonReciprocalAvailable && relationshipToggleState.onlyNonReciprocal

  // "Más" is active when the current layer/filter lives inside its menu
  const isMoreActive =
    activeLayer === 'keywords' ||
    activeLayer === 'zaps' ||
    isNonReciprocalActive ||
    (isCompact && activeLayer === 'connections')

  // Auto-open Más on compact when keywords is active so search is reachable
  useEffect(() => {
    if (isCompact && activeLayer === 'keywords') {
      setIsMoreOpen(true)
    }
  }, [isCompact, activeLayer])

  // Close Más on outside pointer
  useEffect(() => {
    if (!isMoreOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return
      if (!moreRef.current?.contains(e.target)) {
        setIsMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isMoreOpen])

  // Close Más on Escape
  useEffect(() => {
    if (!isMoreOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMoreOpen])

  const handleToggleMore = () => setIsMoreOpen((prev) => !prev)

  const handleMenuItemClick = (action: () => void, keepOpen = false) => {
    action()
    if (!keepOpen) setIsMoreOpen(false)
  }

  return (
    <div className="graph-panel__control-bar">
      <div className="graph-panel__control-actions">
        {/* Conexiones — desktop only (hidden at compact via CSS) */}
        <button
          aria-pressed={activeLayer === 'connections'}
          className={`graph-panel__control-btn graph-panel__control-btn--desktop${
            activeLayer === 'connections' ? ' graph-panel__control-btn--primary' : ''
          }`}
          data-control-tone="connections"
          onClick={() => onToggleLayer('connections')}
          type="button"
        >
          Conexiones
        </button>

        {/* Sigo — always visible */}
        <button
          aria-pressed={relationshipToggleState.following}
          className={`graph-panel__control-btn${
            relationshipToggleState.following
              ? ' graph-panel__control-btn--primary'
              : ''
          }`}
          data-control-tone="relationship"
          onClick={() => onToggleRelationship('following')}
          type="button"
        >
          Sigo
        </button>

        {/* Me siguen — always visible */}
        <button
          aria-pressed={relationshipToggleState.followers}
          className={`graph-panel__control-btn${
            relationshipToggleState.followers
              ? ' graph-panel__control-btn--primary'
              : ''
          }`}
          data-control-tone="relationship"
          onClick={() => onToggleRelationship('followers')}
          type="button"
        >
          Me siguen
        </button>

        {/* Más — always visible, contains secondary utilities */}
        <div className="graph-panel__more-container" ref={moreRef}>
          <button
            aria-expanded={isMoreOpen}
            aria-haspopup="true"
            className={`graph-panel__control-btn graph-panel__more-btn${
              isMoreActive ? ' graph-panel__control-btn--primary' : ''
            }`}
            data-control-tone={isMoreActive ? 'more-active' : 'neutral'}
            onClick={handleToggleMore}
            type="button"
          >
            Más
          </button>

          {isMoreOpen && (
            <div
              className={`graph-panel__more-menu${
                isCompact ? ' graph-panel__more-menu--sheet' : ''
              }`}
              role="group"
            >
              {/* Conexiones — compact only */}
              {isCompact && (
                <button
                  aria-pressed={activeLayer === 'connections'}
                  className={`graph-panel__control-btn${
                    activeLayer === 'connections'
                      ? ' graph-panel__control-btn--primary'
                      : ''
                  }`}
                  data-control-tone="connections"
                  onClick={() =>
                    handleMenuItemClick(() => onToggleLayer('connections'))
                  }
                  type="button"
                >
                  Conexiones
                </button>
              )}

              {/* Sin reciprocidad — when available */}
              {isNonReciprocalAvailable && (
                <button
                  aria-pressed={isNonReciprocalActive}
                  className={`graph-panel__control-btn graph-panel__control-btn--aux${
                    isNonReciprocalActive ? ' graph-panel__control-btn--primary' : ''
                  }`}
                  data-control-tone="relationship"
                  onClick={() =>
                    handleMenuItemClick(onToggleOnlyNonReciprocal)
                  }
                  type="button"
                >
                  Sin reciprocidad
                </button>
              )}

              {/* Palabras */}
              <button
                aria-pressed={activeLayer === 'keywords'}
                className={`graph-panel__control-btn${
                  activeLayer === 'keywords' ? ' graph-panel__control-btn--primary' : ''
                }`}
                data-control-tone="keywords"
                onClick={() =>
                  handleMenuItemClick(
                    () => onToggleLayer('keywords'),
                    isCompact, // keep Más open on compact so search stays visible
                  )
                }
                title={keywordLayerDisabledReason || undefined}
                type="button"
              >
                Palabras
              </button>

              {/* Zaps */}
              <button
                aria-pressed={activeLayer === 'zaps'}
                className={`graph-panel__control-btn${
                  activeLayer === 'zaps' ? ' graph-panel__control-btn--primary' : ''
                }`}
                data-control-tone="zaps"
                disabled={zapLayerStatus !== 'enabled'}
                onClick={() => handleMenuItemClick(() => onToggleLayer('zaps'))}
                title={
                  zapLayerStatus !== 'enabled'
                    ? 'La capa de zaps depende de recibos disponibles.'
                    : undefined
                }
                type="button"
              >
                Zaps
              </button>

              {/* Keyword search — compact only, when keywords active */}
              {isCompact && keywordSearch ? (
                <div className="graph-panel__more-menu-search">{keywordSearch}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Keyword search slot — desktop only */}
      {!isCompact && keywordSearch ? (
        <div className="graph-panel__control-search-slot">{keywordSearch}</div>
      ) : null}
    </div>
  )
})
