/**
 * Глобальный реестр «сейчас играющего» медиа — чтобы на стене одновременно
 * звучал только один трек/видео. Простой модуль-синглтон: React-компонентам
 * не нужно поднимать это состояние выше, они просто дергают одни и те же
 * функции.
 */
let current: HTMLMediaElement | null = null;

export function playExclusive(el: HTMLMediaElement) {
  if (current && current !== el) current.pause();
  current = el;
}
export function stopAllMedia() {
  if (current) current.pause();
  current = null;
}
