/** Цвет попадает в CSS (color-mix и т.п.), поэтому пускаем только #rgb/#rrggbb — иначе в значение можно подсунуть url(). */
export function safeColor(c: string | undefined | null, fallback = '#7c6ff7'): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}
