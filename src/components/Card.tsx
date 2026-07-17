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
 * state can apply. 'active' gets the signature offset block — a real second
 * element positioned behind the card, never a CSS box-shadow — reserved for
 * "this needs attention" and nothing else.
 */
export default function Card({ state, as = 'div', className, children, onClick }: CardProps) {
  const Tag = as;
  const isActive = state === 'active';
  const isDone = state === 'done';

  return (
    <div className="relative">
      {isActive && (
        <div
          aria-hidden
          className="absolute bg-accent"
          style={{
            inset: 0,
            borderRadius: 'var(--radius)',
            transform: 'translate(var(--shadow-offset), var(--shadow-offset))',
          }}
        />
      )}
      <Tag
        onClick={onClick}
        className={clsx('relative w-full bg-card text-left', isDone && 'opacity-[0.58]', className)}
        style={{
          borderRadius: 'var(--radius)',
          borderWidth: 'var(--border-width)',
          borderStyle: 'solid',
          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
        }}
      >
        {children}
      </Tag>
    </div>
  );
}
