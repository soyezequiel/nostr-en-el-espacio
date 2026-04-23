'use client'

import Image from 'next/image'

type BrandLogoProps = {
  className?: string
  imageClassName?: string
  priority?: boolean
  sizes?: string
}

export default function BrandLogo({
  className,
  imageClassName,
  priority = false,
  sizes = '150px',
}: BrandLogoProps) {
  return (
    <span className={className}>
      <Image
        alt="Nostr Espacial"
        className={imageClassName}
        fetchPriority={priority ? 'high' : undefined}
        height={660}
        loading={priority ? 'eager' : undefined}
        preload={priority}
        sizes={sizes}
        src="/branding/nostr-espacial-logo-lockup-v2.png"
        width={1500}
      />
    </span>
  )
}
