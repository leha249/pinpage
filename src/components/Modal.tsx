import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

/**
 * Модалка на нативном <dialog>: фокус-трап, Escape и затемнение
 * даёт сам браузер; закрытие по клику вне окна — через клик по ::backdrop
 * (он приходит как клик по самому <dialog>).
 */
export default function Modal({ open, onClose, title, width = 440, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      style={{ width }}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="modal-body">
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
          {title && <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>{title}</h3>}
          {children}
        </div>
      )}
    </dialog>
  );
}
