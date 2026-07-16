export interface RowAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

/**
 * A bottom-sheet action list — used for both the row kebab menu and any
 * right-click/long-press shortcut that opens it. A fixed bottom sheet
 * (rather than a floating dropdown anchored to the trigger) avoids
 * off-screen positioning edge cases and keeps every action within thumb
 * reach on mobile, at the cost of covering more of the screen than a
 * small anchored menu would on desktop — an acceptable trade for one
 * consistent implementation.
 */
export default function RowActionMenu({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title?: string;
  actions: RowAction[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-2 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>}
        <div className="flex flex-col">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                a.onClick();
                onClose();
              }}
              className={`rounded-xl px-3 py-3.5 text-left text-sm font-medium ${
                a.destructive ? 'text-red-600' : 'text-slate-700'
              } active:bg-slate-100`}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="mt-1 rounded-xl px-3 py-3.5 text-left text-sm font-medium text-slate-400 active:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
