'use client'

import { memo } from 'react'
import Link from 'next/link'
import AvatarFallback from '@/components/AvatarFallback'
import BrandLogo from '@/components/BrandLogo'
import { isSafeAvatarUrl } from '@/features/graph-runtime/avatar'
import { resolveAvatarFetchUrl } from '@/features/graph-runtime/avatarProxyUrl'
import type { SocialGraphCaptureFormat } from '@/features/graph-v2/renderer/socialGraphCapture'
import { ImageShareIcon } from '@/features/graph-v2/ui/SigmaIcons'

interface Props {
  rootDisplayName: string | null
  rootNpub: string | null
  rootPictureUrl: string | null
  onSwitchRoot: () => void
  brandVersion?: string
  shareFormat?: SocialGraphCaptureFormat
  shareStatus?: string | null
  shareBusy?: boolean
  canShare?: boolean
  onShareFormatChange?: (format: SocialGraphCaptureFormat) => void
  onShareImage?: () => void
}

export const SigmaTopBar = memo(function SigmaTopBar({
  rootDisplayName,
  rootNpub,
  rootPictureUrl,
  onSwitchRoot,
  brandVersion = 'v0.3.2',
  shareFormat = 'wide',
  shareStatus = null,
  shareBusy = false,
  canShare = false,
  onShareFormatChange,
  onShareImage,
}: Props) {
  const initials = rootDisplayName
    ? rootDisplayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('') || 'N'
    : 'N'

  const npubShort = rootNpub
    ? rootNpub.slice(0, 10) + '…' + rootNpub.slice(-6)
    : null

  const rootPictureSrc =
    rootPictureUrl && isSafeAvatarUrl(rootPictureUrl)
      ? resolveAvatarFetchUrl(rootPictureUrl, undefined, 64)
      : null

  return (
    <div className="sg-topbar">
      {rootDisplayName !== null ? (
        <div className="sg-root-chip">
          <div className="sg-root-chip__avatar">
            {rootPictureSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                height={28}
                loading="eager"
                src={rootPictureSrc}
                width={28}
              />
            ) : (
              <AvatarFallback initials={initials} seed={rootNpub ?? rootDisplayName} />
            )}
          </div>
          <div className="sg-root-chip__meta">
            <span className="sg-root-chip__label">Identidad raíz</span>
            <span className="sg-root-chip__name">{rootDisplayName}</span>
            {npubShort && (
              <span className="sg-root-chip__npub">{npubShort}</span>
            )}
          </div>
          <button
            className="sg-root-chip__switch"
            onClick={onSwitchRoot}
            type="button"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div />
      )}

      <div className="sg-topbar__right">
        {onShareImage ? (
          <div className="sg-share-control" aria-live="polite">
            <select
              aria-label="Formato de imagen"
              className="sg-share-control__select"
              disabled={shareBusy || !canShare}
              onChange={(event) => {
                onShareFormatChange?.(event.target.value as SocialGraphCaptureFormat)
              }}
              value={shareFormat}
            >
              <option value="wide">wide</option>
              <option value="square">square</option>
              <option value="story">story</option>
            </select>
            <button
              className="sg-share-control__button"
              disabled={shareBusy || !canShare}
              onClick={onShareImage}
              type="button"
            >
              <ImageShareIcon />
              <span>Compartir imagen</span>
            </button>
            {shareStatus ? (
              <span className="sg-share-control__status">{shareStatus}</span>
            ) : null}
          </div>
        ) : null}
        <div className="sg-brand">
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <BrandLogo
              className="block"
              imageClassName="h-10 w-auto object-contain"
              priority
              sizes="96px"
            />
          </Link>
          <span style={{ marginLeft: 8, color: 'var(--sg-fg-faint)' }}>
            {brandVersion}
          </span>
        </div>
      </div>
    </div>
  )
})
