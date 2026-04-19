'use client'

import { memo } from 'react'

export interface FilterPill {
  id: 'all' | 'following' | 'followers' | 'mutuals' | 'oneway' | 'connections'
  label: string
  count: number | null
  swatch: string
  hint: string
}

interface Props {
  activeId: FilterPill['id']
  pills: FilterPill[]
  onSelect: (id: FilterPill['id']) => void
}

export const SigmaFilterBar = memo(function SigmaFilterBar({
  activeId,
  pills,
  onSelect,
}: Props) {
  const activePill = pills.find((pill) => pill.id === activeId) ?? pills[0]

  return (
    <div className="sg-filter-stack" role="region" aria-label="Filtros y leyenda del grafo">
      <div className="sg-filter-bar">
        {pills.map((pill) => (
          <button
            aria-label={`${pill.label}: ${pill.hint}`}
            className={`sg-filter-pill${pill.id === activeId ? ' sg-filter-pill--active' : ''}`}
            key={pill.id}
            onClick={() => onSelect(pill.id)}
            title={pill.hint}
            type="button"
          >
            <span
              className="sg-filter-pill__swatch"
              style={{ background: pill.swatch }}
            />
            {pill.label}
            <span
              className="sg-filter-pill__count"
              style={{
                color:
                  pill.id === activeId
                    ? 'oklch(16% 0 0 / 0.5)'
                    : 'var(--sg-fg-faint)',
              }}
            >
              {pill.count ?? '-'}
            </span>
          </button>
        ))}
      </div>
      <div className="sg-filter-help">
        <span className="sg-filter-help__scope">{activePill?.hint}</span>
        <span className="sg-filter-key">
          <span className="sg-filter-key__swatch sg-filter-key__swatch--follow" />
          Celeste: follow saliente
        </span>
        <span className="sg-filter-key">
          <span className="sg-filter-key__swatch sg-filter-key__swatch--inbound" />
          Naranja: follower entrante
        </span>
        <span className="sg-filter-key">
          <span className="sg-filter-key__swatch sg-filter-key__swatch--highlight" />
          Brillante: seleccionado, pin o zap
        </span>
      </div>
    </div>
  )
})
