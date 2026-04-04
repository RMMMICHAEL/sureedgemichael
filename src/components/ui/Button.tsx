import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?:    'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ variant = 'ghost', size = 'md', className, children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none';

  const sizes = {
    sm:  'px-3 py-1.5 text-xs',
    md:  'px-5 py-2 text-sm',
    lg:  'px-7 py-3 text-base',
  };

  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--g)',
      color: '#000',
      border: 'none',
      borderRadius: 100,
      boxShadow: 'var(--btn-glow)',
      fontFamily: "'Manrope', sans-serif",
      fontWeight: 700,
    },
    ghost: {
      background: 'var(--sur)',
      color: 'var(--t2)',
      border: '1px solid var(--b)',
      borderRadius: 100,
    },
    danger: {
      background: 'var(--rd)',
      color: 'var(--r)',
      border: '1px solid rgba(255,77,77,.2)',
      borderRadius: 100,
    },
    outline: {
      background: 'transparent',
      color: 'var(--t2)',
      border: '1px solid var(--b2)',
      borderRadius: 100,
    },
  };

  return (
    <button
      className={clsx(base, sizes[size], className)}
      style={styles[variant]}
      {...props}
    >
      {children}
    </button>
  );
}
