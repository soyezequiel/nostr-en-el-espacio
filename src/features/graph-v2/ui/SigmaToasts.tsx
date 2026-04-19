'use client'

import { memo } from 'react'
import { CloseIcon } from '@/features/graph-v2/ui/SigmaIcons'

export interface SigmaToast {
  id: string
  msg: string
  tone?: 'warn' | 'bad' | 'zap' | 'default'
}

interface Props {
  toasts: SigmaToast[]
  onDismiss?: (id: SigmaToast['id']) => void
}

export const SigmaToasts = memo(function SigmaToasts({ onDismiss, toasts }: Props) {
  if (toasts.length === 0) return null

  return (
    <div aria-live="polite" className="sg-toasts">
      {toasts.map((t) => (
        <div
          className={`sg-toast${t.tone && t.tone !== 'default' ? ` sg-toast--${t.tone}` : ''}`}
          key={t.id}
        >
          <span className="sg-toast__message">{t.msg}</span>
          {onDismiss ? (
            <button
              aria-label="Cerrar notificacion"
              className="sg-toast__close"
              onClick={() => onDismiss(t.id)}
              title="Cerrar"
              type="button"
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
})
