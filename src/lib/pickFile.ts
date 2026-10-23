import { MAX_FILE_MB } from '../types';

export type FileKind = 'image' | 'audio' | 'video';

/**
 * Открывает нативный диалог выбора файла и проверяет размер.
 * Возвращает File или null (отмена / слишком большой — тогда вызывает onError).
 */
export function pickFile(
  accept: string, kind: FileKind, onError: (msg: string) => void
): Promise<File | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.appendChild(inp);

    const cleanup = () => inp.remove();

    inp.addEventListener('change', () => {
      const file = inp.files?.[0] ?? null;
      cleanup();
      if (!file) return resolve(null);
      const limit = MAX_FILE_MB[kind];
      if (file.size > limit * 1024 * 1024) {
        onError(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум ${limit} МБ.`);
        return resolve(null);
      }
      resolve(file);
    });

    // Отмена диалога: change не срабатывает — подчищаем при возврате фокуса.
    window.addEventListener('focus', function onFocusBack() {
      window.removeEventListener('focus', onFocusBack);
      setTimeout(() => { if (!inp.files?.length) { cleanup(); resolve(null); } }, 400);
    }, { once: true });

    inp.click();
  });
}
