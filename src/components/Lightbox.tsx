import { useEffect, useRef, useState } from 'react';

const EVENT = 'pp:lightbox';

/** Открыть картинку на весь экран из любого места приложения. */
export function openLightbox(src: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: src }));
}

export default function Lightbox() {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const h = (e: Event) => setSrc((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (src && !d.open) d.showModal();
    if (!src && d.open) d.close();
  }, [src]);

  return (
    <dialog
      ref={ref}
      className="img-overlay-dialog"
      onClose={() => setSrc(null)}
      onClick={() => setSrc(null)}
    >
      {src && <img src={src} alt="" />}
    </dialog>
  );
}
