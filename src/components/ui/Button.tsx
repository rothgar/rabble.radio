import type { ReactElement, ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface ButtonProps extends BaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> {
  href?: undefined;
}

interface LinkProps extends BaseProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> {
  href: string;
}

type Props = ButtonProps | LinkProps;

const variantClasses: Record<Variant, string> = {
  primary:   'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:opacity-80',
  secondary: 'border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] active:opacity-80',
  ghost:     'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] active:opacity-80',
  danger:    'border border-red-800 bg-red-950/40 text-red-300 hover:bg-red-900/50 active:opacity-80',
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-touch px-3  text-label  gap-1.5',
  md: 'min-h-touch px-4  text-body   gap-2',
  lg: 'min-h-touch px-5  text-title  gap-2',
};

function classes(variant: Variant, size: Size, fullWidth: boolean, extra = '') {
  return [
    'inline-flex items-center justify-center',
    'rounded-sm font-semibold',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
    'disabled:opacity-40 disabled:pointer-events-none',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    extra,
  ].filter(Boolean).join(' ');
}

export function Button(props: Props): ReactElement {
  const {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className = '',
    children,
    href,
    ...rest
  } = props;

  const cls = classes(variant, size, fullWidth, className);

  if (href !== undefined) {
    return (
      <Link href={href} className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

export default Button;
