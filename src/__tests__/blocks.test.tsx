// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../supabase', async () => await import('./fakeBackend'));

import { AppProvider } from '../context/AppContext';
import App from '../App';
import { state, reset, seedUser } from './fakeBackend';

const ptr = (el: Element, type: string, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));

beforeEach(() => {
  reset(); localStorage.clear();
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  (HTMLElement.prototype as any).showPopover = () => {};
  (HTMLElement.prototype as any).hidePopover = () => {};
  const orig = Element.prototype.matches;
  Element.prototype.matches = function (s: string) { return s === ':popover-open' ? false : orig.call(this, s); };
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  seedUser('nova', 'x'); localStorage.setItem('pp_session', 'nova');
  state.walls['nova'] = [
    { id: 'a', type: 'text', x: 10, y: 10, w: 200, h: 80, content: 'первый' },
    { id: 'b', type: 'image', x: 300, y: 10, w: 100, h: 100, content: 'https://x/i.png', radius: 10 },
    { id: 'm', type: 'music', x: 10, y: 200, w: 300, h: 90, content: { title: 'Песня', artist: 'Артист', dataUrl: 'https://x/a.mp3' } },
  ];
});
afterEach(() => cleanup());

async function editMode() {
  render(<AppProvider><App /></AppProvider>);
  await waitFor(() => screen.getByText('Изменить'));
  fireEvent.click(screen.getByText('Изменить'));
  await waitFor(() => expect(document.querySelectorAll('.resize-handle').length).toBeGreaterThan(0));
}
const blockEl = (i: number) => document.querySelectorAll<HTMLElement>('.block')[i];

describe('взаимодействие с блоками', () => {
  it('перетаскивание двигает блок', async () => {
    await editMode();
    const b = blockEl(0);
    ptr(b.querySelector('.block-inner')!, 'pointerdown', 100, 100);
    ptr(b, 'pointermove', 150, 130);
    ptr(b, 'pointerup', 150, 130);
    await waitFor(() => { expect(b.style.left).toBe('60px'); expect(b.style.top).toBe('40px'); });
  });
  it('угловая ручка меняет размер', async () => {
    await editMode();
    const b = blockEl(0);
    const h = b.querySelector<HTMLElement>('.rh-se')!;
    ptr(h, 'pointerdown', 0, 0); ptr(h, 'pointermove', 30, 20); ptr(h, 'pointerup', 30, 20);
    await waitFor(() => { expect(b.style.width).toBe('230px'); expect(b.style.height).toBe('100px'); });
  });
  it('верхне-левая ручка сдвигает и меняет размер, минимальный размер соблюдается', async () => {
    await editMode();
    const b = blockEl(0);
    const h = b.querySelector<HTMLElement>('.rh-nw')!;
    ptr(h, 'pointerdown', 0, 0); ptr(h, 'pointermove', 500, 500); ptr(h, 'pointerup', 500, 500);
    await waitFor(() => { expect(parseInt(b.style.width)).toBe(80); expect(parseInt(b.style.height)).toBe(40); });
    // Противоположный (правый нижний) угол остаётся на месте: блок не «уезжает» при упоре в минимум.
    expect(parseInt(b.style.left) + 80).toBe(10 + 200);
    expect(parseInt(b.style.top) + 40).toBe(10 + 80);
  });
  it('блок нельзя утащить в отрицательные координаты', async () => {
    await editMode();
    const b = blockEl(0);
    ptr(b.querySelector('.block-inner')!, 'pointerdown', 100, 100);
    ptr(b, 'pointermove', -500, -500);
    ptr(b, 'pointerup', -500, -500);
    await waitFor(() => { expect(b.style.left).toBe('0px'); expect(b.style.top).toBe('0px'); });
  });
  it('у текстового блока есть панель оформления', async () => {
    await editMode();
    const size = blockEl(0).querySelector<HTMLSelectElement>('select[aria-label="Размер текста"]')!;
    fireEvent.change(size, { target: { value: '24' } });
    fireEvent.click(blockEl(0).querySelector('[aria-label="Курсив"]')!);
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => {
      const st = state.walls['nova'][0].style!;
      expect(st.fontSize).toBe(24); expect(st.italic).toBe(true);
    });
  });
  it('ручка поворота вращает блок', async () => {
    await editMode();
    const b = blockEl(0);
    const h = b.querySelector<HTMLElement>('.rot-handle')!;
    ptr(h, 'pointerdown', 10, 0); ptr(h, 'pointermove', 0, 10); ptr(h, 'pointerup', 0, 10);
    await waitFor(() => expect(b.style.rotate).toBe('90deg'));
    fireEvent.click(b.querySelector('[title="Сбросить поворот"]')!);
    await waitFor(() => expect(b.style.rotate).toBe('0deg'));
  });
  it('копия, порядок слоёв и удаление', async () => {
    await editMode();
    fireEvent.click(blockEl(0).querySelector('[title="Дублировать"]')!);
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(4));
    expect(blockEl(3).style.left).toBe('34px');
    fireEvent.click(blockEl(0).querySelector('[title="Выше"]')!);
    await waitFor(() => expect(blockEl(1).textContent).toContain('первый'));
    fireEvent.click(blockEl(3).querySelector('[title="Удалить"]')!);
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(3));
  });
  it('слайдер скругления меняет radius и сохраняется', async () => {
    await editMode();
    const slider = blockEl(1).querySelector<HTMLInputElement>('.radius-slider')!;
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => expect(state.walls['nova'].find((b) => b.id === 'b')?.radius).toBe(50));
  });
  it('правка текста сохраняется (blur → Сохранить)', async () => {
    await editMode();
    const ta = blockEl(0).querySelector('textarea')!;
    fireEvent.change(ta, { target: { value: 'новый текст' } });
    fireEvent.blur(ta);
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => expect(state.walls['nova'][0].content).toBe('новый текст'));
  });
  it('название и исполнитель трека редактируются и сохраняются', async () => {
    await editMode();
    const [title, artist] = Array.from(blockEl(2).querySelectorAll<HTMLInputElement>('.music-edit-inp'));
    fireEvent.change(title, { target: { value: 'Новое' } }); fireEvent.blur(title);
    fireEvent.change(artist, { target: { value: 'Кто-то' } }); fireEvent.blur(artist);
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => {
      const m = state.walls['nova'].find((b) => b.id === 'm')!.content as any;
      expect(m.title).toBe('Новое'); expect(m.artist).toBe('Кто-то'); expect(m.dataUrl).toBe('https://x/a.mp3');
    });
  });
  it('в режиме просмотра ручек и панелей нет, трек показывает название', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('Песня'));
    expect(document.querySelectorAll('.resize-handle').length).toBe(0);
    expect(screen.getByText('Артист')).toBeTruthy();
  });
  it('кнопка play переключается', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('Песня'));
    const play = document.querySelector<HTMLElement>('.music-play')!;
    expect(play.textContent).toBe('▶');
    fireEvent.click(play);
    await waitFor(() => expect(play.textContent).toBe('⏸'));
    fireEvent.click(play);
    await waitFor(() => expect(play.textContent).toBe('▶'));
  });
});

describe('реакции на блоки', () => {
  it('реакции отображаются со счётчиком', async () => {
    state.reactions = [
      { blockId: 'a', username: 'kira', emoji: '👍' },
      { blockId: 'a', username: 'echo', emoji: '👍' },
    ];
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('👍'));
    const pill = document.querySelector('.react-pill')!;
    expect(pill.querySelector('.react-count')!.textContent).toBe('2');
    expect(pill.classList.contains('mine')).toBe(false);
  });

  it('добавление реакции через пикер', async () => {
    render(<AppProvider><App /></AppProvider>);
    // waitFor с «просто возвратом элемента» не ждёт: null — не ошибка. Проверяем явно.
    await waitFor(() => { if (!document.querySelector('.react-add')) throw new Error('кнопка реакций ещё не отрисована'); });
    fireEvent.click(document.querySelector('.react-add')!);
    await waitFor(() => { if (!document.querySelector('.react-picker')) throw new Error('пикер ещё не открылся'); });
    fireEvent.click(screen.getByText('❤️'));
    await waitFor(() => expect(state.reactions).toEqual([{ blockId: 'a', username: 'nova', emoji: '❤️' }]));
    const pill = document.querySelector('.react-pill.mine')!;
    expect(pill.textContent).toContain('❤️');
  });

  it('повторный клик снимает свою реакцию', async () => {
    state.reactions = [{ blockId: 'a', username: 'nova', emoji: '👍' }];
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('👍'));
    fireEvent.click(document.querySelector('.react-pill.mine')!);
    await waitFor(() => expect(state.reactions.length).toBe(0));
    expect(document.querySelectorAll('.react-pill').length).toBe(0);
  });

  it('в режиме правки панель реакций не отображается', async () => {
    state.reactions = [{ blockId: 'a', username: 'kira', emoji: '👍' }];
    await editMode();
    expect(document.querySelectorAll('.react-pill').length).toBe(0);
  });
});
