import { useCallback, useRef } from 'react';
import type { WallBlock } from '../../types';

type Updater = (id: string, patch: Partial<WallBlock>) => void;

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
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    start.current.x = e.clientX; start.current.y = e.clientY;
    start.current.bx = block.x; start.current.by = block.y;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.current.x, dy = ev.clientY - start.current.y;
      onChange(block.id, { x: start.current.bx + dx, y: start.current.by + dy });
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }, [block.id, block.x, block.y, onChange]);

  const startResize = useCallback((e: React.PointerEvent<HTMLElement>, dx: number, dy: number, cx: number, cy: number) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, bx: block.x, by: block.y, bw: block.w, bh: block.h, rot0: 0, angle0: 0 };

    const move = (ev: PointerEvent) => {
      const ddx = ev.clientX - start.current.x, ddy = ev.clientY - start.current.y;
      const w = Math.max(80, start.current.bw + dx * ddx);
      const h = Math.max(40, start.current.bh + dy * ddy);
      onChange(block.id, {
        w, h,
        x: start.current.bx + (cx ? ddx : 0),
        y: start.current.by + (cy ? ddy : 0),
      });
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }, [block.id, block.w, block.h, block.x, block.y, onChange]);

  const startRotate = useCallback((e: React.PointerEvent<HTMLElement>, wrapEl: HTMLElement) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = wrapEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    start.current.angle0 = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    start.current.rot0 = block.rot || 0;

    const move = (ev: PointerEvent) => {
      const r = wrapEl.getBoundingClientRect();
      const c2x = r.left + r.width / 2, c2y = r.top + r.height / 2;
      const angle = Math.atan2(ev.clientY - c2y, ev.clientX - c2x) * 180 / Math.PI;
      onChange(block.id, { rot: start.current.rot0 + (angle - start.current.angle0) });
    };
    const up = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }, [block.id, block.rot, onChange]);

  return { startDrag, startResize, startRotate };
}
