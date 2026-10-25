import { useEffect, useRef, useState } from 'react';
import type { BlockType } from '../../types';

interface Props {
  saving: boolean;
  onAdd: (type: BlockType) => void;
  onSave: () => void;
}

const ITEMS: { type: BlockType; label: string }[] = [
  { type: 'text', label: 'Текст' },
  { type: 'image', label: 'Изображение с устройства' },
  { type: 'video', label: 'Видео с устройства' },
  { type: 'music', label: 'Музыка с устройства' },
];

/** Нативный popover есть не везде (Safari < 17, Firefox < 125, Chrome < 114) — без него нужен запасной вариант. */
const hasPopover = () => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/**
 * Меню «Добавить блок». Где поддерживается — нативный popover (закрытие по клику вне меню
 * и по Escape делает браузер); иначе обычное выпадающее меню с ручным закрытием.
 */
export default function EditToolbar({ saving, onAdd, onSave }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const native = hasPopover();

  // Запасной вариант: закрываем по клику вне меню и по Escape.
  useEffect(() => {
    if (native || !fallbackOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setFallbackOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFallbackOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [native, fallbackOpen]);

  const toggle = () => {
    const menu = menuRef.current, btn = btnRef.current;
    if (!btn) return;
    if (!native) { setFallbackOpen((o) => !o); return; }
    if (!menu) return;
    if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
    const r = btn.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
    menu.showPopover();
  };

  const choose = (type: BlockType) => {
    if (native) menuRef.current?.hidePopover(); else setFallbackOpen(false);
    onAdd(type);
  };

  const items = ITEMS.map((it) => (
    <button key={it.type} className="add-item" onClick={() => choose(it.type)}>{it.label}</button>
  ));

  return (
    <div id="edit-toolbar">
      <button ref={btnRef} className="toolbar-pill t-add" aria-haspopup="menu" aria-expanded={native ? undefined : fallbackOpen} onClick={toggle}>
        + Добавить блок
      </button>
      {native
        ? <div ref={menuRef} popover="auto" className="add-menu">{items}</div>
        : fallbackOpen && <div ref={menuRef} className="add-menu add-menu-fallback" role="menu">{items}</div>}
      <button className="toolbar-pill t-save" disabled={saving} onClick={onSave}>
        {saving ? 'Сохраняем...' : '✓ Сохранить'}
      </button>
    </div>
  );
}
