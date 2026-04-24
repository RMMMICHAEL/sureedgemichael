'use client';

import { useState } from 'react';

interface Props {
  src:  string | null | undefined;
  name: string;
  size?: number;
}

function initials(name: string): string {
  return name
    .split(/[\s\/\-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function TeamLogo({ src, name, size = 28 }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0"
        style={{
          width: size, height: size,
          background: 'rgba(63,255,33,.10)',
          border: '1px solid rgba(63,255,33,.20)',
          color: 'var(--g)',
          fontSize: size * 0.33,
        }}
        title={name}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`Logo ${name}`}
      width={size}
      height={size}
      loading="lazy"
      className="object-contain flex-shrink-0 rounded"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
