import { ImageResponse } from 'next/og';

export const size        = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #3FFF21 0%, #00CC6E 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Hexagon shape */}
        <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1L12.196 4V10L7 13L1.804 10V4L7 1Z"
            fill="#060A07"
            fillOpacity="0.9"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
