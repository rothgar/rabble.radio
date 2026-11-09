import type { ReactElement, HTMLAttributes } from 'react';
import Link from 'next/link';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  href?: undefined;
  interactive?: boolean;
}

interface CardLinkProps extends HTMLAttributes<HTMLAnchorElement> {
  href: string;
  interactive?: boolean;
}

type Props = CardProps | CardLinkProps;

/* Brand card: solid cream container, 8px corners, 1.5px teal outline. */
const base =
  'rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const interactive =
  'transition-[background-color,box-shadow] duration-150 hover:bg-[var(--color-surface-raised)] hover:shadow-[var(--shadow-md)] active:opacity-80';

export function Card({ href, interactive: isInteractive, className = '', children, ...rest }: Props): ReactElement {
  const cls = [base, isInteractive ? interactive : '', className].filter(Boolean).join(' ');

  if (href !== undefined) {
    return (
      <Link href={href} className={cls} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <div className={cls} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

export default Card;
