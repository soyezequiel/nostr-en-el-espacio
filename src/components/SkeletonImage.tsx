'use client';

import Image, { type ImageProps } from 'next/image';
import { type ReactNode, useState } from 'react';

type SkeletonImageProps = Omit<ImageProps, 'fill'> & {
  containerClassName?: string;
  fallback?: ReactNode;
};

const getImageKey = (src: ImageProps['src']) => {
  if (typeof src === 'string') {
    return src;
  }

  return 'src' in src ? src.src : src.default.src;
};

function SkeletonImageInner({
  alt,
  className,
  containerClassName,
  fallback,
  onError,
  onLoad,
  sizes,
  src,
  ...props
}: SkeletonImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={['relative w-full h-full bg-lc-dark', containerClassName].filter(Boolean).join(' ')}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={['lc-img-skeleton relative w-full h-full', containerClassName].filter(Boolean).join(' ')}>
      <Image
        {...props}
        alt={alt}
        fill
        referrerPolicy="no-referrer"
        sizes={sizes}
        src={src}
        unoptimized
        className={[className, loaded ? 'loaded' : ''].filter(Boolean).join(' ')}
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
      />
    </div>
  );
}

export default function SkeletonImage(props: SkeletonImageProps) {
  return <SkeletonImageInner key={getImageKey(props.src)} {...props} />;
}
