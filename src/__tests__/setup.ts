// Настройка тестового окружения vitest.
//
// Node 22+ добавляет нативный глобальный `localStorage`/`sessionStorage`
// (Web Storage), который возвращает `undefined`, если Node не запущен с
// флагом `--localstorage-file`. Vitest 2.x в jsdom-окружении не копирует эти
// ключи из окна jsdom, если они уже есть в `globalThis`, поэтому в тестах
// `localStorage.*` падает с "Cannot read properties of undefined".
//
// Здесь мы перенаправляем глобальные `localStorage`/`sessionStorage` на
// настоящий сторадж окна jsdom (он живёт в `globalThis.jsdom.window`).

const jsdomWindow = (globalThis as { jsdom?: { window?: Window } }).jsdom?.window;

for (const key of ['localStorage', 'sessionStorage'] as const) {
  const storage = jsdomWindow?.[key];
  if (!storage) continue;
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    get: () => storage,
    set: () => {},
  });
}
