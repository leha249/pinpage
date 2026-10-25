import { useCallback, useRef } from 'react';
import type { WallBlock } from '../../types';

type Updater = (id: string, patch: Partial<WallBlock>) => void;

const MIN_W = 80, MIN_H = 40;

/** Подписывается на движение указателя до pointerup/pointercancel (отмена жеста тачем тоже завершает его). */
function track(el: HTMLElement, pointerId: number, move: (ev: PointerEvent) => void) {
  el.setPointerCapture?.(pointerId);
  const end = (ev: PointerEvent) => {
    try { el.releasePointerCapture?.(ev.pointerId); } catch { /* уже отпущен */ }
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/**
 * Перетаскивание/изменение размера/поворот блока через Pointer Events —
 * единый API для мыши, тача и пера. setPointerCapture гарантирует, что
 * слежение не потеряется, даже если указатель уйдёт за пределы блока.
 */
export function useBlockInteraction(block: WallBlock, onChange: Updater) {
  const start = useRef({ x: 0, y: 0, bx: 0, by: 0, bw: 0, bh: 0, rot0: 0, angle0: 0 });

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('textarea, button, input, .resize-handle, .rot-handle')) return;
    start.current.x = e.clientX; start.current.y = e.clientY;
    start.current.bx = block.x; start.current.by = block.y;
    track(e.currentTarget, e.pointerId, (ev) => {
      const dx = ev.clientX - start.current.x, dy = ev.clientY - start.current.y;
      // Не даём утащить блок в отрицательные координаты — оттуда его уже не достать.
      onChange(block.id, { x: Math.max(0, start.current.bx + dx), y: Math.max(0, start.current.by + dy) });
    });
  }, [block.id, block.x, block.y, onChange]);

  /**
   * dx/dy ∈ {-1,0,1} — какую сторону тянем. Расчёт идёт в осях самого блока (с учётом поворота),
   * а противоположный край остаётся на месте: поэтому упор в минимальный размер не «сдвигает» блок,
   * а на повёрнутых блоках ручки тянут ровно туда, куда ведёт указатель.
   */
  const startResize = useCallback((e: React.PointerEvent<HTMLElement>, dx: number, dy: number) => {
    e.stopPropagation();
    start.current = { x: e.clientX, y: e.clientY, bx: block.x, by: block.y, bw: block.w, bh: block.h, rot0: 0, angle0: 0 };
    const rad = ((block.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);

    track(e.currentTarget, e.pointerId, (ev) => {
      const s = start.current;
      const ddx = ev.clientX - s.x, ddy = ev.clientY - s.y;
      const lx = ddx * cos + ddy * sin;          // сдвиг указателя в осях блока
      const ly = -ddx * sin + ddy * cos;
      const w = Math.max(MIN_W, s.bw + dx * lx);
      const h = Math.max(MIN_H, s.bh + dy * ly);
      const shiftX = (dx * (w - s.bw)) / 2;      // смещение центра в осях блока
      const shiftY = (dy * (h - s.bh)) / 2;
      const cx = s.bx + s.bw / 2 + shiftX * cos - shiftY * sin;
      const cy = s.by + s.bh / 2 + shiftX * sin + shiftY * cos;
      onChange(block.id, { w, h, x: Math.max(0, cx - w / 2), y: Math.max(0, cy - h / 2) });
    });
  }, [block.id, block.w, block.h, block.x, block.y, block.rot, onChange]);

  const startRotate = useCallback((e: React.PointerEvent<HTMLElement>, wrapEl: HTMLElement) => {
    e.stopPropagation();
    const rect = wrapEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    start.current.angle0 = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    start.current.rot0 = block.rot || 0;

    track(e.currentTarget, e.pointerId, (ev) => {
      const r = wrapEl.getBoundingClientRect();
      const c2x = r.left + r.width / 2, c2y = r.top + r.height / 2;
      const angle = Math.atan2(ev.clientY - c2y, ev.clientX - c2x) * 180 / Math.PI;
      onChange(block.id, { rot: start.current.rot0 + (angle - start.current.angle0) });
    });
  }, [block.id, block.rot, onChange]);

  return { startDrag, startResize, startRotate };
}
