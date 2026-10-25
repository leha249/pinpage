import { MAX_FILE_MB } from '../types';
import { fileKind, type FileKind } from './fileKinds';

export type { FileKind };

/**
 * Открывает нативный диалог выбора файла, проверяет тип и размер.
 * `kinds` — какие типы можно (для чата: ['image', 'video']); лимит размера берётся
 * по реальному типу выбранного файла, а не по подсказке в `accept`.
 * Возвращает File или null (отмена / не подходит — тогда вызывает onError).
 */
export function pickFile(
  accept: string, kinds: FileKind | FileKind[], onError: (msg: string) => void
): Promise<File | null> {
  const allowed = Array.isArray(kinds) ? kinds : [kinds];
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.appendChild(inp);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocusBack);
      inp.remove();
      resolve(file);
    };

    inp.addEventListener('change', () => {
      const file = inp.files?.[0] ?? null;
      if (!file) return finish(null);
      const kind = fileKind(file);
      if (!kind || !allowed.includes(kind)) {
        onError('Этот тип файла не поддерживается.');
        return finish(null);
      }
      const limit = MAX_FILE_MB[kind];
      if (file.size > limit * 1024 * 1024) {
        onError(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум ${limit} МБ.`);
        return finish(null);
      }
      finish(file);
    });

    // Современные браузеры сообщают об отмене событием cancel; для остальных —
    // запасной вариант по возврату фокуса, но с запасом по времени: на медленных
    // устройствах change приходит заметно позже focus, и ранний сброс терял файл.
    inp.addEventListener('cancel', () => finish(null));
    function onFocusBack() {
      window.setTimeout(() => { if (!inp.files?.length) finish(null); }, 1500);
    }
    window.addEventListener('focus', onFocusBack, { once: true });

    inp.click();
  });
}
