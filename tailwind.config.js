/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /* ── Surface palette (from CSS vars) ── */
        bg:    'var(--bg)',
        bg2:   'var(--bg2)',
        bg3:   'var(--bg3)',
        bg4:   'var(--bg4)',
        sur:   'var(--sur)',
        sur2:  'var(--sur2)',

        /* ── Accent colors ── */
        accent:  { DEFAULT: 'var(--g)', dim: 'var(--gd)', border: 'var(--gb)' },
        green:   { DEFAULT: 'var(--g)', dim: 'var(--gd)', border: 'var(--gb)' },
        red:     { DEFAULT: 'var(--r)', dim: 'var(--rd)' },
        yellow:  { DEFAULT: 'var(--y)', dim: 'var(--yd)' },
        blue:    { DEFAULT: 'var(--bl)', dim: 'var(--bld)' },
        orange:  { DEFAULT: 'var(--or)', dim: 'var(--ord)' },

        /* ── Text ── */
        t1:  'var(--t)',
        t2:  'var(--t2)',
        t3:  'var(--t3)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        glow:    '0 0 20px rgba(0,255,138,.20), 0 0 40px rgba(0,255,138,.08)',
        'glow-sm': '0 0 10px rgba(0,255,138,.18)',
        card:    '0 4px 24px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.2)',
        'card-hover': '0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(0,255,138,.08)',
        modal:   '0 24px 80px rgba(0,0,0,.65), 0 0 1px rgba(0,255,138,.1)',
      },
      animation: {
        'fade-in':   'fadeIn .25s ease both',
        'slide-up':  'slideUp .3s cubic-bezier(.2,.8,.4,1) both',
        'scale-in':  'scaleIn .2s ease both',
        'pulse-dot': 'pulseDot 2s ease infinite',
        'glow-pulse': 'glowPulse 3s ease infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px) scale(.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 6px var(--g)' },
          '50%':       { opacity: '.4', boxShadow: 'none' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0,255,138,.15)' },
          '50%':       { boxShadow: '0 0 24px rgba(0,255,138,.35)' },
        },
      },
    },
  },
  plugins: [],
};
