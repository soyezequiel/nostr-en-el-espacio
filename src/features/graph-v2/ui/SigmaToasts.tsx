'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('sigma.toasts')
  if (toasts.length === 0) return null

  return (
    <div aria-live="polite" className="sg-toasts">
      {toasts.map((toast) => (
        <div
          className={`sg-toast${toast.tone && toast.tone !== 'default' ? ` sg-toast--${toast.tone}` : ''}`}
          key={toast.id}
        >
          <span className="sg-toast__message">{toast.msg}</span>
          {onDismiss ? (
            <button
              aria-label={t('close')}
              className="sg-toast__close"
              onClick={() => onDismiss(toast.id)}
              title={t('closeTitle')}
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
