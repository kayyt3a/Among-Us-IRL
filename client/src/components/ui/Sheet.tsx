import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A bottom sheet with a dimmed backdrop. Omit onClose for a sheet the player
 * can't dismiss by tapping outside (e.g. while a kill is being verified).
 */
export default function Sheet({
  title,
  description,
  icon,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}) {
  // Callers pass inline arrows, so keep the latest in a ref instead of
  // re-running the scroll lock on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet-host">
        <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
          <div className="sheet-handle" />
          <div className="stack-lg">
            <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
              {icon}
              <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                <h2 className="h2">{title}</h2>
                {description && <p className="muted small">{description}</p>}
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
