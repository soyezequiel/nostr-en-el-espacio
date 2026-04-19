'use client'

import Image from 'next/image'

type BrandLogoProps = {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export default function BrandLogo({
  className,
  imageClassName,
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={className}>
      <Image
        alt="Nostr Espacial"
        className={imageClassName}
        height={660}
        priority={priority}
        src="/branding/nostr-espacial-logo-lockup-v2.png"
        width={1500}
      />
    </span>
  )
}
