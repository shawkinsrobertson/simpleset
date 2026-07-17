import type { ReactNode } from 'react';

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t border border-border bg-card p-5 sm:rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded p-1.5 text-text-secondary hover:text-text">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
