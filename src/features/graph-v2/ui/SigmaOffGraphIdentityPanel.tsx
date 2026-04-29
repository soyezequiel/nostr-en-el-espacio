'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import { nip19 } from 'nostr-tools'

import AvatarFallback from '@/components/AvatarFallback'
import { fetchProfileByPubkey, type NostrProfile } from '@/lib/nostr'

const HEX_64_RE = /^[0-9a-f]{64}$/i

type FetchPhase = 'loading' | 'ready' | 'error'

interface ProfileState {
  pubkey: string
  phase: FetchPhase
  profile: NostrProfile | null
  message: string | null
}

const buildLoadingProfileState = (pubkey: string): ProfileState => ({
  pubkey,
  phase: 'loading',
  profile: null,
  message: null,
})

const encodeNpub = (pubkey: string) => {
  if (!HEX_64_RE.test(pubkey)) return null
  try {
    return nip19.npubEncode(pubkey)
  } catch {
    return null
  }
}

const getInitials = (label: string): string => {
  const trimmed = label.trim()
  if (trimmed.length === 0) return '?'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return trimmed.charAt(0).toUpperCase()
  if (words.length === 1) return words[0].charAt(0).toUpperCase()
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

export interface SigmaOffGraphIdentityPanelProps {
  pubkey: string
  fallbackLabel: string
  onBack: () => void
}

export function SigmaOffGraphIdentityPanel({
  pubkey,
  fallbackLabel,
  onBack,
}: SigmaOffGraphIdentityPanelProps): React.JSX.Element {
  const [state, setState] = useState<ProfileState>(() => buildLoadingProfileState(pubkey))

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const profile = await fetchProfileByPubkey(pubkey)
        if (cancelled) return
        setState({
          pubkey,
          phase: 'ready',
          profile,
          message: null,
        })
      } catch (error) {
        if (cancelled) return
        setState({
          pubkey,
          phase: 'error',
          profile: null,
          message:
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el perfil.',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pubkey])

  const isCurrentState = state.pubkey === pubkey
  const npub = encodeNpub(pubkey)
  const profile = isCurrentState ? state.profile : null
  const displayName =
    profile?.displayName?.trim() ||
    profile?.name?.trim() ||
    fallbackLabel.trim() ||
    (npub ? `${npub.slice(0, 14)}...` : `${pubkey.slice(0, 12)}...`)
  const isLoading = !isCurrentState || state.phase === 'loading'
  const bio = profile?.about?.trim() ?? ''
  const primalUrl = npub ? `https://primal.net/p/${npub}` : null
  const jumbleUrl = npub ? `https://jumble.social/users/${npub}` : null

  return (
    <div className="sg-zap-detail">
      <div className="sg-zap-detail__head">
        <button
          className="sg-mini-action"
          onClick={onBack}
          type="button"
        >
          {'<- Volver al detalle del zap'}
        </button>
      </div>

      <div className="sg-node-hero" data-panel-drag-handle>
        <div className="sg-node-hero__avatar-wrap">
          <div className="sg-node-hero__avatar">
            {profile?.picture ? (
              <img alt="" src={profile.picture} />
            ) : (
              <AvatarFallback
                initials={getInitials(displayName)}
                labelClassName=""
                seed={pubkey}
              />
            )}
          </div>
        </div>
        <div className="sg-node-hero__content">
          <div className="sg-node-hero__title-row">
            <h2>{isLoading && !profile ? 'Cargando perfil...' : displayName}</h2>
          </div>
          <div className="sg-node-hero__handle">{pubkey.slice(0, 12)}...</div>
          <div className="sg-node-hero__badges">
            <span className="sg-badge sg-badge--warn">Fuera del grafo</span>
            {profile?.nip05 ? (
              <span className="sg-badge sg-badge--ok">nip05</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sg-zap-detail__grid">
        <section className="sg-zap-detail__row">
          <span className="sg-zap-detail__row-label">Bio</span>
          <p className="sg-zap-detail__comment">
            {isLoading && !profile
              ? 'Cargando bio...'
              : bio.length > 0
                ? bio
                : '(sin bio)'}
          </p>
        </section>
        <section className="sg-zap-detail__row">
          <span className="sg-zap-detail__row-label">npub</span>
          <span className="sg-zap-detail__row-value sg-zap-detail__row-value--mono">
            {npub ?? pubkey}
          </span>
        </section>
        {profile?.nip05 ? (
          <section className="sg-zap-detail__row">
            <span className="sg-zap-detail__row-label">NIP-05</span>
            <span className="sg-zap-detail__row-value sg-zap-detail__row-value--mono">
              {profile.nip05}
            </span>
          </section>
        ) : null}
        {profile?.lud16 ? (
          <section className="sg-zap-detail__row">
            <span className="sg-zap-detail__row-label">Lightning</span>
            <span className="sg-zap-detail__row-value sg-zap-detail__row-value--mono">
              {profile.lud16}
            </span>
          </section>
        ) : null}
        {profile?.website ? (
          <section className="sg-zap-detail__row">
            <span className="sg-zap-detail__row-label">Web</span>
            <a
              className="sg-zap-detail__row-value"
              href={profile.website}
              rel="noreferrer noopener"
              target="_blank"
            >
              {profile.website}
            </a>
          </section>
        ) : null}
        {isCurrentState && state.phase === 'error' ? (
          <section className="sg-zap-detail__row">
            <span className="sg-zap-detail__row-label">Error</span>
            <p className="sg-zap-detail__post-empty sg-zap-detail__post-empty--error">
              {state.message ?? 'No se pudo cargar el perfil.'}
            </p>
          </section>
        ) : null}
      </div>

      {primalUrl || jumbleUrl ? (
        <div className="sg-zap-detail__actions">
          {primalUrl ? (
            <a
              className="sg-btn"
              href={primalUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              Ver en Primal
            </a>
          ) : null}
          {jumbleUrl ? (
            <a
              className="sg-btn"
              href={jumbleUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              Ver en Jumble
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
