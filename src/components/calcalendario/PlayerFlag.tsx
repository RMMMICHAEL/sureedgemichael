'use client';

import { useState } from 'react';
import { countryToFlag, countryAlt } from '@/lib/flagsHelper';

interface Props {
  country: string | null | undefined;
  size?: number;
}

export function PlayerFlag({ country, size = 24 }: Props) {
  const [failed, setFailed] = useState(false);
  const src = countryToFlag(country);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={countryAlt(country)}
      width={size}
      height={Math.round(size * 0.67)}
      loading="lazy"
      className="object-cover rounded-sm flex-shrink-0"
      style={{ width: size, height: Math.round(size * 0.67) }}
      onError={() => setFailed(true)}
    />
  );
}
