'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

interface Props {
  onLoadIdentity: () => void
}

export const SigmaEmptyState = memo(function SigmaEmptyState({ onLoadIdentity }: Props) {
  const t = useTranslations('sigma.emptyState')

  return (
    <div className="sg-empty">
      <div className="sg-empty__ring">
        <span className="sg-empty__ring-label">SIGMA</span>
      </div>
      <h1>{t('title')}</h1>
      <p className="sg-empty__sub">{t('copy')}</p>
      <button
        className="sg-empty__cta"
        onClick={onLoadIdentity}
        type="button"
      >
        {t('cta')}
      </button>
      <span className="sg-empty__tip">{t('tip')}</span>
    </div>
  )
})
