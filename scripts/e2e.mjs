// E2E-проверка PinPage в реальном Chrome (headless) через puppeteer-core.
// Запуск: node scripts/e2e.mjs  (нужен работающий `npm run preview` на 127.0.0.1:4173)
// Переменные окружения: E2E_BASE (адрес сайта), CHROME_PATH (путь к Chrome/Chromium).
// ВАЖНО: тест регистрирует пользователя и в конце удаляет его. Лучше гонять на тестовой базе
// (см. .env.example), а не на боевой.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173/';
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) { console.error('Не нашёл Chrome. Укажи путь в переменной CHROME_PATH.'); process.exit(1); }
const ts = Date.now().toString(36);
const USERNAME = `zze2e${ts}`;
const PASSWORD = 'e2e-pass-1234';
const DISPLAY = 'E2E Тест';

const errors = [];
const warnings = [];

function log(...a) { console.log('[e2e]', ...a); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.type();
  const txt = m.text();
  if (t === 'error') errors.push(txt);
  else if (t === 'warning') warnings.push(txt);
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(sel) {
  return page.$eval(sel, (el) => el.textContent || '');
}
async function waitText(s, timeout = 12000) {
  // textContent, а не innerText: innerText учитывает text-transform (label
  // «Имя на сайте» рендерится как «ИМЯ НА САЙТЕ») и не находит исходный текст.
  await page.waitForFunction((s) => (document.body.textContent || '').includes(s), { timeout }, s);
}
async function clickText(s) {
  await waitText(s);
  const ok = await page.evaluate((s) => {
    const els = [...document.querySelectorAll('button, a, [role="button"]')];
    const el = els.find((e) => (e.textContent || '').trim().includes(s));
    if (el) { el.click(); return true; }
    return false;
  }, s);
  if (!ok) throw new Error('Не нашёл кликабельный элемент с текстом: ' + s);
}
async function shot(name) {
  mkdirSync('scripts/shots', { recursive: true });
  await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: false });
}

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitText('PinPage');
  await waitText('Войти');
  log('✓ экран входа отрисован');

  // ── Регистрация ──
  await clickText('Регистрация');
  await waitText('Имя на сайте');
  await page.waitForSelector('input[placeholder="Как тебя звать?"]');
  const inputs = await page.$$('input.auth-input');
  if (inputs.length < 3) throw new Error('Ожидал 3 поля при регистрации, нашёл ' + inputs.length);
  await inputs[0].type(DISPLAY);      // имя
  await inputs[1].type(USERNAME);     // username
  await inputs[2].type(PASSWORD);     // пароль
  await clickText('Создать аккаунт');
  await waitText('Изменить', 15000);   // «Изменить» — кнопка владельца на загруженной стене
  log('✓ регистрация прошла, попали на стену');
  await shot('01-wall-after-register');

  // ── Режим правки + добавить текстовый блок ──
  await clickText('Изменить');
  await waitText('Режим правки');
  log('✓ режим правки включён');
  await clickText('Добавить блок');
  await waitText('Текст');
  await clickText('Текст');
  // ждём появления блока (textarea или сам блок)
  await page.waitForSelector('#blocks-layer .block', { timeout: 8000 });
  const blockCount = (await page.$$('#blocks-layer .block')).length;
  log('✓ текстовый блок добавлен, блоков на стене:', blockCount);
  await shot('02-edit-text-block');

  // ── Перетаскивание блока (drag на 120px вправо) ──
  await page.evaluate(() => {
    // В реальном браузере pointerId из синтетического события не активен —
    // setPointerCapture кинул бы NotFoundError, поэтому подменяем его.
    HTMLElement.prototype.setPointerCapture = function () {};
    HTMLElement.prototype.releasePointerCapture = function () {};
    const el = document.querySelector('#blocks-layer .block');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
    fire('pointerdown', cx, cy);
    fire('pointermove', cx + 60, cy + 30);
    fire('pointermove', cx + 120, cy + 60);
    fire('pointerup', cx + 120, cy + 60);
  });
  await sleep(300);
  const posAfter = await page.$eval('#blocks-layer .block', (el) => ({ x: el.style.left, y: el.style.top }));
  log('✓ после перетаскивания позиция блока:', JSON.stringify(posAfter));
  await shot('03-after-drag');

  // ── Сохранение ──
  await clickText('Сохранить');
  await waitText('Стена сохранена', 10000);
  log('✓ стена сохранена');
  await shot('04-after-save');

  // ── Смена темы ──
  const themeBefore = await page.$eval('html', (el) => el.dataset.theme);
  await page.click('.theme-toggle');
  await page.waitForFunction((t) => document.documentElement.dataset.theme !== t, { timeout: 5000 }, themeBefore);
  const themeAfter = await page.$eval('html', (el) => el.dataset.theme);
  log('✓ тема переключена:', themeBefore, '→', themeAfter);
  await shot('05-theme-' + themeAfter);

  // ── Друзья / Настройки ──
  await clickText('Друзья');
  await waitText('Люди');
  log('✓ вкладка «Друзья» открылась');
  await shot('06-friends');
  await clickText('Настройки');
  await waitText('Опасная зона');
  log('✓ вкладка «Настройки» открылась');
  await shot('07-settings');

  // ── Мобильный viewport ──
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await clickText('Стена');
  await waitText('Изменить');
  await shot('08-mobile-wall');
  log('✓ мобильный вид стены снят');

  // ── Уборка: удаляем тестовый аккаунт (нужен пароль) ──
  await clickText('Настройки');
  await waitText('Опасная зона');
  await clickText('Удалить аккаунт');
  await page.waitForSelector('#set-del-pw');
  await page.type('#set-del-pw', PASSWORD);
  await clickText('Удалить навсегда');
  await waitText('Войти');
  log('✓ тестовый аккаунт удалён');

  log('══════════════════════════════════════');
  log('ГОТОВО. Ошибки консоли:', errors.length, '| предупреждения:', warnings.length);
  errors.forEach((e) => log('  ERROR:', e));
  warnings.slice(0, 10).forEach((w) => log('  WARN:', w));
} catch (err) {
  log('!!! СБОЙ на шаге:', err.message);
  await shot('99-failure').catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
