import type { ReactElement, ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
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

/* Brand buttons: rounded rectangles with a thick teal outline (the default
   `border` is 1.5px). Primary is Rebel Red with white text, accent is Vintage
   Orange with teal text, secondary is a cream card. */
const variantClasses: Record<Variant, string> = {
  primary:   'border border-[var(--color-border)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:opacity-80',
  accent:    'border border-[var(--color-border)] bg-[var(--color-accent-2)] text-[var(--color-text)] hover:bg-[var(--color-accent-2-hover)] active:opacity-80',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-highlight-muted)] active:opacity-80',
  ghost:     'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-ink-muted)] active:opacity-80',
  danger:    'border border-[var(--color-error)] bg-[var(--color-error-muted)] text-[var(--color-error-text)] hover:bg-[var(--color-accent-200)] active:opacity-80',
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-touch px-3  text-label  gap-1.5',
  md: 'min-h-touch px-4  text-body   gap-2',
  lg: 'min-h-touch px-5  text-title  gap-2 font-display',
};

function classes(variant: Variant, size: Size, fullWidth: boolean, extra = '') {
  return [
    'inline-flex items-center justify-center',
    'rounded-sm font-semibold',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-2)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
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
