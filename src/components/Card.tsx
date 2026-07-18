import type { ReactNode } from 'react';
import clsx from 'clsx';

export type CardState = 'done' | 'active' | 'todo';

interface CardProps {
  /** Omit for a neutral card with no done/active/todo meaning (e.g. a plain stat card). */
  state?: CardState;
  as?: 'div' | 'button';
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

/**
 * The app's one card primitive, styled consistently everywhere a done/active/todo
 * state can apply. 'active' gets the signature offset drop-shadow (`card-lift` —
 * a 0-blur box-shadow driven by --shadow-offset, the same technique buttons and
 * other cards use) — reserved for "this needs attention" and nothing else.
 */
export default function Card({ state, as = 'div', className, children, onClick }: CardProps) {
  const Tag = as;
  const isActive = state === 'active';
  const isDone = state === 'done';

  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'w-full rounded border bg-card text-left',
        isActive ? 'card-lift border-accent' : 'border-border',
        isDone && 'opacity-[0.58]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
