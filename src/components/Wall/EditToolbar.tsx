import { useRef } from 'react';
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

/**
 * Меню «Добавить блок» — нативный popover: закрытие по клику вне меню и по
 * Escape делает сам браузер, никаких ручных document-слушателей.
 */
export default function EditToolbar({ saving, onAdd, onSave }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const menu = menuRef.current, btn = btnRef.current;
    if (!menu || !btn) return;
    if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
    const r = btn.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
    menu.showPopover();
  };

  return (
    <div id="edit-toolbar">
      <button ref={btnRef} className="toolbar-pill t-add" onClick={toggle}>+ Добавить блок</button>
      <div ref={menuRef} popover="auto" className="add-menu">
        {ITEMS.map((it) => (
          <button
            key={it.type} className="add-item"
            onClick={() => { menuRef.current?.hidePopover(); onAdd(it.type); }}
          >
            {it.label}
          </button>
        ))}
      </div>
      <button className="toolbar-pill t-save" disabled={saving} onClick={onSave}>
        {saving ? 'Сохраняем...' : '✓ Сохранить'}
      </button>
    </div>
  );
}
