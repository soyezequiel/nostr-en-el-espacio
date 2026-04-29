'use client'

import {
  memo,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import AvatarFallback from '@/components/AvatarFallback'
import BrandLogo from '@/components/BrandLogo'
import { isSafeAvatarUrl } from '@/features/graph-runtime/avatar'
import { resolveAvatarFetchUrl } from '@/features/graph-runtime/avatarProxyUrl'
import { CloseIcon, SearchIcon } from '@/features/graph-v2/ui/SigmaIcons'
import { localizePathname, type Locale } from '@/i18n/routing'

interface SearchMatch {
  pubkey: string
  label: string
}

interface SearchLoadProgress {
  percent: number
  label: string
  nodeDrawLabel?: string | null
  nodeDrawTitle?: string | null
}

interface Props {
  rootDisplayName: string | null
  rootNpub: string | null
  rootPictureUrl: string | null
  onSwitchRoot: () => void
  searchQuery: string
  searchMatches: readonly SearchMatch[]
  searchPlaceholder: string
  searchTotalNodeCount: number
  searchDisabled: boolean
  searchExpanded: boolean
  onSearchChange: (value: string) => void
  onSearchFocus: () => void
  onSearchClear: () => void
  onSearchSelect: (pubkey: string) => void
  onSearchSubmit: () => void
  searchInputRef: RefObject<HTMLInputElement | null>
  searchLoadProgress?: SearchLoadProgress | null
  brandVersion?: string
}

export const SigmaTopBar = memo(function SigmaTopBar({
  rootDisplayName,
  rootNpub,
  rootPictureUrl,
  onSwitchRoot,
  searchQuery,
  searchMatches,
  searchPlaceholder,
  searchTotalNodeCount,
  searchDisabled,
  searchExpanded,
  onSearchChange,
  onSearchFocus,
  onSearchClear,
  onSearchSelect,
  onSearchSubmit,
  searchInputRef,
  searchLoadProgress = null,
  brandVersion = 'v0.3.2',
}: Props) {
  const t = useTranslations('sigma.topBar')
  const locale = useLocale() as Locale
  const rootLabel = rootDisplayName ?? t('rootFallback')
  const initials =
    rootLabel
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || 'N'

  const rootPictureSrc =
    rootPictureUrl && isSafeAvatarUrl(rootPictureUrl)
      ? resolveAvatarFetchUrl(rootPictureUrl, undefined, 64)
      : null
  const trimmedSearchQuery = searchQuery.trim()
  const hasSearchQuery = trimmedSearchQuery.length > 0
  const visibleMatches = searchMatches.slice(0, 8)
  const hasMoreMatches = searchMatches.length > visibleMatches.length
  const resolvedSearchPlaceholder = searchDisabled
    ? t('placeholderEmpty')
    : t('placeholderReady')
  const searchLoadProgressValue =
    searchLoadProgress === null
      ? null
      : Math.min(100, Math.max(0, Math.round(searchLoadProgress.percent)))
  const isSearchLoadComplete = searchLoadProgressValue === 100
  const searchLoadProgressStyle =
    searchLoadProgressValue === null
      ? undefined
      : ({
          '--sg-search-load-progress': `${searchLoadProgressValue * 3.6}deg`,
        } as CSSProperties)
  const searchStatus = !trimmedSearchQuery
    ? t('status.base', { count: searchTotalNodeCount })
    : searchMatches.length === 0
      ? t('status.empty')
      : t('status.matches', { count: searchMatches.length })

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onSearchSubmit()
  }

  return (
    <div className="sg-topbar">
      <div className="sg-top-search-wrap">
        <div
          aria-busy={searchLoadProgressValue !== null ? true : undefined}
          className={`sg-top-search${searchExpanded ? ' sg-top-search--expanded' : ''}${searchDisabled ? ' sg-top-search--disabled' : ''}${searchLoadProgressValue !== null ? ' sg-top-search--loading' : ''}${isSearchLoadComplete ? ' sg-top-search--loading-complete' : ''}`}
          style={searchLoadProgressStyle}
        >
          {searchLoadProgressValue !== null ? (
            <span
              aria-label={searchLoadProgress?.label ?? t('progressAria')}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={searchLoadProgressValue}
              className="sg-top-search__load-status"
              role="progressbar"
            />
          ) : null}
          <span className="sg-top-search__icon">
            <SearchIcon />
          </span>
          <input
            aria-controls="sigma-person-search-results"
            aria-label={t('searchAria')}
            autoComplete="off"
            className="sg-top-search__input"
            disabled={searchDisabled}
            id="sigma-person-search"
            inputMode="search"
            onChange={handleSearchChange}
            onFocus={onSearchFocus}
            onKeyDown={handleSearchKeyDown}
            placeholder={resolvedSearchPlaceholder || searchPlaceholder}
            ref={searchInputRef}
            spellCheck={false}
            type="search"
            value={searchQuery}
          />
          {searchLoadProgress?.nodeDrawLabel ? (
            <span
              className="sg-top-search__load-caption"
              title={searchLoadProgress.nodeDrawTitle ?? searchLoadProgress.nodeDrawLabel}
            >
              {searchLoadProgress.nodeDrawLabel}
            </span>
          ) : null}
          {hasSearchQuery ? (
            <button
              aria-label={t('clearSearch')}
              className="sg-top-search__clear"
              onClick={onSearchClear}
              type="button"
            >
              <CloseIcon />
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="sg-top-search__clear sg-top-search__clear--empty"
            />
          )}
          <button
            aria-label={t('switchRoot', { label: rootLabel })}
            className="sg-top-search__profile"
            onClick={onSwitchRoot}
            title={t('switchRoot', { label: rootLabel })}
            type="button"
          >
            <span className="sg-top-search__avatar">
              {rootPictureSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  decoding="async"
                  height={36}
                  loading="eager"
                  src={rootPictureSrc}
                  width={36}
                />
              ) : (
                <AvatarFallback initials={initials} seed={rootNpub ?? rootLabel} />
              )}
            </span>
          </button>
        </div>

        {searchExpanded ? (
          <div className="sg-top-search-menu" id="sigma-person-search-results">
            <p className="sg-top-search-menu__status">{searchStatus}</p>
            {hasSearchQuery && visibleMatches.length > 0 ? (
              <div className="sg-top-search-menu__results">
                {visibleMatches.map((match) => (
                  <button
                    className="sg-top-search-menu__result"
                    key={match.pubkey}
                    onClick={() => onSearchSelect(match.pubkey)}
                    type="button"
                  >
                    <span className="sg-top-search-menu__result-name">{match.label}</span>
                    <span className="sg-top-search-menu__result-key">
                      {match.pubkey.slice(0, 10)}...
                    </span>
                  </button>
                ))}
                {hasMoreMatches ? (
                  <div className="sg-top-search-menu__more">
                    {t('moreMatches', {
                      count: searchMatches.length - visibleMatches.length,
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="sg-top-search-menu__hint">{t('hint')}</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="sg-topbar__right">
        <div className="sg-brand">
          <Link
            href={localizePathname('/', locale)}
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
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
