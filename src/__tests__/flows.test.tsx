// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';

vi.mock('../supabase', async () => await import('./fakeBackend'));

import { AppProvider } from '../context/AppContext';
import App from '../App';
import { state, reset, seedUser } from './fakeBackend';

// jsdom не знает <dialog>.showModal и popover — подставляем минимальные заглушки.
beforeEach(() => {
  reset(); localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  (HTMLElement.prototype as any).showPopover = function () {};
  (HTMLElement.prototype as any).hidePopover = function () {};
  const orig = Element.prototype.matches;
  Element.prototype.matches = function (s: string) { return s === ':popover-open' ? false : orig.call(this, s); };
});
afterEach(() => cleanup());

const mount = () => render(<AppProvider><App /></AppProvider>);

async function login(user: string, pw: string) {
  mount();
  await waitFor(() => screen.getByText('Войти →'));
  fireEvent.change(screen.getByPlaceholderText('только латиница, без пробелов'), { target: { value: user } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: pw } });
  fireEvent.click(screen.getByText('Войти →'));
}

describe('вход и регистрация', () => {
  it('вход с верным паролем открывает стену', async () => {
    seedUser('nova', 'secret1');
    await login('nova', 'secret1');
    await waitFor(() => expect(screen.getAllByText('NOVA').length).toBeGreaterThan(0));
    expect(screen.getByText('Стена')).toBeTruthy();
  });
  it('неверный пароль → ошибка', async () => {
    seedUser('nova', 'secret1');
    await login('nova', 'bad');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Неверный логин или пароль'));
  });
  it('забаненный не входит', async () => {
    seedUser('nova', 'secret1'); state.bans['nova'] = { username: 'nova', reason: 'спам', at: '' };
    await login('nova', 'secret1');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('спам'));
  });
  it('регистрация создаёт аккаунт (пароль уходит в отдельное хранилище, а не в профиль) и стену', async () => {
    mount();
    await waitFor(() => screen.getByText('Регистрация'));
    fireEvent.click(screen.getByText('Регистрация'));
    fireEvent.change(screen.getByPlaceholderText('Как тебя звать?'), { target: { value: 'Вася' } });
    fireEvent.change(screen.getByPlaceholderText('только латиница, без пробелов'), { target: { value: 'vasya' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByText('Создать аккаунт →'));
    await waitFor(() => expect(state.users['vasya']).toBeTruthy());
    expect(state.passwords['vasya']).toBe('pass1234');
    expect('password' in state.users['vasya']).toBe(false);
    await waitFor(() => expect(screen.getAllByText('Вася').length).toBeGreaterThan(0));
  });
  it('сессия восстанавливается из localStorage', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => expect(screen.getAllByText('NOVA').length).toBeGreaterThan(0));
  });
});

describe('вкладки и настройки', () => {
  it('переключение вкладок', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('Выбери друга слева'));
    fireEvent.click(screen.getByText('Обновления'));
    await waitFor(() => screen.getByText('что изменилось в PinPage со временем'));
    fireEvent.click(screen.getByText('Настройки'));
    await waitFor(() => screen.getByText('Сохранить профиль'));
  });
  it('сохранение профиля НЕ выкидывает со страницы настроек', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Настройки'));
    fireEvent.click(screen.getByText('Настройки'));
    await waitFor(() => screen.getByText('Сохранить профиль'));
    const name = screen.getAllByDisplayValue('NOVA')[0];
    fireEvent.change(name, { target: { value: 'Новая' } });
    fireEvent.click(screen.getByText('Сохранить профиль'));
    await waitFor(() => expect(state.users['nova'].displayName).toBe('Новая'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Сохранить профиль')).toBeTruthy(); // всё ещё в настройках
  });
  it('смена пароля: неверный текущий → ошибка, верный → сохраняется', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Настройки'));
    fireEvent.click(screen.getByText('Настройки'));
    await waitFor(() => screen.getByText('Сменить пароль'));
    const pws = document.querySelectorAll('input[type=password]');
    fireEvent.change(pws[0], { target: { value: 'wrong' } });
    fireEvent.change(pws[1], { target: { value: 'newpass1' } });
    fireEvent.click(screen.getByText('Сменить пароль'));
    await waitFor(() => screen.getByText('Текущий пароль неверен'));
    fireEvent.change(pws[0], { target: { value: 'secret1' } });
    fireEvent.click(screen.getByText('Сменить пароль'));
    await waitFor(() => expect(state.passwords['nova']).toBe('newpass1'));
  });
});

describe('стена', () => {
  it('режим правки: добавить текст и сохранить', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Изменить'));
    fireEvent.click(screen.getByText('Изменить'));
    await waitFor(() => screen.getByText('+ Добавить блок'));
    fireEvent.click(screen.getByText('Текст'));
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(1));
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => expect(state.walls['nova']?.length).toBe(1));
    expect(state.walls['nova'][0].type).toBe('text');
    await waitFor(() => screen.getByText('Изменить')); // вышли из режима правки
  });
  it('стена блока показывает сохранённый текст', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    state.walls['nova'] = [{ id: 'a', type: 'text', x: 10, y: 10, w: 200, h: 80, content: 'привет мир' }];
    mount();
    await waitFor(() => screen.getByText('привет мир'));
  });
  it('на чужой стене нет кнопки правки, есть добавить в друзья', async () => {
    seedUser('nova', 'secret1'); seedUser('kira', 'x'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('Найти'));
    fireEvent.click(screen.getByText('KIRA'));
    await waitFor(() => screen.getByText('+ Добавить в друзья'));
    expect(screen.queryByText('Изменить')).toBeNull();
    fireEvent.click(screen.getByText('+ Добавить в друзья'));
    await waitFor(() => expect(state.friends.has('nova>kira')).toBe(true));
  });
});

describe('чат', () => {
  async function openChat() {
    seedUser('nova', 'secret1'); seedUser('kira', 'x'); localStorage.setItem('pp_session', 'nova');
    state.friends.add('nova>kira'); state.friends.add('kira>nova'); // взаимно
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('KIRA'));
    fireEvent.click(screen.getByText('KIRA'));
    await waitFor(() => screen.getByPlaceholderText('Сообщение...'));
  }
  it('отправка, правка и удаление сообщения', async () => {
    await openChat();
    const inp = screen.getByPlaceholderText('Сообщение...');
    fireEvent.change(inp, { target: { value: 'привет' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    await waitFor(() => screen.getByText('привет'));
    fireEvent.click(screen.getByText('Ред.'));
    fireEvent.change(inp, { target: { value: 'пока' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    await waitFor(() => screen.getByText('пока'));
    expect(screen.getByText('(ред.)')).toBeTruthy();
    fireEvent.click(screen.getByText('Удал.'));
    await waitFor(() => expect(screen.queryByText('пока')).toBeNull());
  });
  it('входящие помечаются прочитанными при открытии', async () => {
    seedUser('nova', 'secret1'); seedUser('kira', 'x'); localStorage.setItem('pp_session', 'nova');
    state.friends.add('nova>kira'); state.friends.add('kira>nova');
    state.messages.push({ id: 99, from: 'kira', to: 'nova', text: 'hey', edited: false, read: false, at: Date.now() });
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('KIRA'));
    expect(screen.getByText('1')).toBeTruthy(); // бейдж непрочитанных
    fireEvent.click(screen.getByText('KIRA'));
    await waitFor(() => expect(state.messages[0].read).toBe(true));
  });
});

describe('админка', () => {
  async function openAdmin() {
    seedUser('leha249', 'adm'); seedUser('bob', 'x'); localStorage.setItem('pp_session', 'leha249');
    mount();
    await waitFor(() => screen.getByText('Админ'));
    fireEvent.click(screen.getByText('Админ'));
    await waitFor(() => screen.getByText('@bob'));
  }
  it('обычному пользователю кнопки админки нет', async () => {
    seedUser('nova', 'x'); localStorage.setItem('pp_session', 'nova');
    mount(); await waitFor(() => screen.getByText('Стена'));
    expect(screen.queryByText('Админ')).toBeNull();
  });
  it('удаление: при отказе базы пользователь остаётся и показана ошибка', async () => {
    await openAdmin();
    state.failDeleteUser = true;
    fireEvent.click(screen.getByText('Удалить'));
    await waitFor(() => screen.getByText('Удалить навсегда'));
    fireEvent.click(screen.getByText('Удалить навсегда'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Не удалось удалить'));
    expect(state.users['bob']).toBeTruthy();
  });
  it('удаление успешно убирает пользователя', async () => {
    await openAdmin();
    fireEvent.click(screen.getByText('Удалить'));
    await waitFor(() => screen.getByText('Удалить навсегда'));
    fireEvent.click(screen.getByText('Удалить навсегда'));
    await waitFor(() => expect(state.users['bob']).toBeUndefined());
    await waitFor(() => expect(screen.queryByText('@bob')).toBeNull());
  });
  it('бан и разбан', async () => {
    await openAdmin();
    fireEvent.click(screen.getByText('Бан'));
    const input = await screen.findByPlaceholderText('Причина бана...');
    fireEvent.change(input, { target: { value: 'флуд' } });
    fireEvent.click(screen.getByText('Заблокировать'));
    await waitFor(() => expect(state.bans['bob']?.reason).toBe('флуд'));
    await waitFor(() => screen.getByText('Разбан'));
    fireEvent.click(screen.getByText('Разбан'));
    await waitFor(() => expect(state.bans['bob']).toBeUndefined());
  });
  it('«Ред. стену» открывает чужую стену сразу в режиме правки', async () => {
    await openAdmin();
    fireEvent.click(screen.getByText('Ред. стену'));
    await waitFor(() => screen.getByText('+ Добавить блок'));
    fireEvent.click(screen.getByText('Текст'));
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(1));
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => expect(state.walls['bob']?.length).toBe(1));
    await waitFor(() => screen.getByText('Админ-панель')); // вернулись в админку
  });
});

describe('чейнджлог', () => {
  it('админ добавляет запись', async () => {
    seedUser('leha249', 'adm'); localStorage.setItem('pp_session', 'leha249');
    mount(); await waitFor(() => screen.getByText('Обновления'));
    fireEvent.click(screen.getByText('Обновления'));
    await waitFor(() => screen.getByText('Новая запись'));
    fireEvent.change(screen.getByPlaceholderText('Версия, напр. 1.6'), { target: { value: '9.9' } });
    fireEvent.change(screen.getByPlaceholderText('Заголовок'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByText('Опубликовать'));
    await waitFor(() => screen.getByText('v9.9'));
  });
});


describe('надёжность: сбои сети не должны ни разлогинивать, ни затирать данные', () => {
  it('нет связи при запуске: сессия сохраняется, можно повторить', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    state.failNetwork = true;
    mount();
    await waitFor(() => screen.getByText(/Нет связи с сервером/));
    expect(localStorage.getItem('pp_session')).toBe('nova'); // НЕ вышли из аккаунта
    state.failNetwork = false;
    fireEvent.click(screen.getByText('Повторить'));
    await waitFor(() => expect(screen.getAllByText('NOVA').length).toBeGreaterThan(0));
  });
  it('стена не загрузилась: показываем ошибку, правка и сохранение недоступны', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    state.walls['nova'] = [{ id: 'a', type: 'text', x: 10, y: 10, w: 200, h: 80, content: 'важное' }];
    state.failWall = true;
    mount();
    await waitFor(() => screen.getByText(/Не удалось загрузить стену/));
    expect(screen.queryByText('✓ Сохранить')).toBeNull();
    expect(state.calls.some((c) => c.startsWith('setWall'))).toBe(false); // пустая стена не ушла на сервер
    state.failWall = false;
    fireEvent.click(screen.getByText('Повторить'));
    await waitFor(() => screen.getByText('важное'));
  });
  it('выход из режима правки с несохранёнными изменениями спрашивает и умеет отбросить', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Изменить'));
    fireEvent.click(screen.getByText('Изменить'));
    await waitFor(() => screen.getByText('+ Добавить блок'));
    fireEvent.click(screen.getByText('Текст'));
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(1));
    fireEvent.click(screen.getByText('Режим правки'));
    await waitFor(() => screen.getByText('Есть несохранённые изменения'));
    fireEvent.click(screen.getByText('Не сохранять'));
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(0));
    expect(state.walls['nova']).toBeUndefined();
  });
  it('конфликт версий: можно перезаписать своей версией', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    state.wallConflict = true;
    mount();
    await waitFor(() => screen.getByText('Изменить'));
    fireEvent.click(screen.getByText('Изменить'));
    await waitFor(() => screen.getByText('+ Добавить блок'));
    fireEvent.click(screen.getByText('Текст'));
    await waitFor(() => expect(document.querySelectorAll('.block').length).toBe(1));
    fireEvent.click(screen.getByText('✓ Сохранить'));
    await waitFor(() => screen.getByText('Стена изменилась'));
    expect(state.walls['nova']).toBeUndefined();
    fireEvent.click(screen.getByText('Перезаписать моей версией'));
    await waitFor(() => expect(state.walls['nova']?.length).toBe(1));
  });
});

describe('вход: понятные ошибки', () => {
  it('кириллица в username не вырезается молча, а объясняется', async () => {
    await login('Леха', 'secret1');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('только латинские буквы'));
  });
  it('служебное имя занять нельзя', async () => {
    mount();
    await waitFor(() => screen.getByText('Регистрация'));
    fireEvent.click(screen.getByText('Регистрация'));
    fireEvent.change(screen.getByPlaceholderText('Как тебя звать?'), { target: { value: 'Админ' } });
    fireEvent.change(screen.getByPlaceholderText('только латиница, без пробелов'), { target: { value: 'leha249' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByText('Создать аккаунт →'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('зарезервировано'));
    expect(state.users['leha249']).toBeUndefined();
  });
  it('короткий пароль при регистрации отклоняется', async () => {
    mount();
    await waitFor(() => screen.getByText('Регистрация'));
    fireEvent.click(screen.getByText('Регистрация'));
    fireEvent.change(screen.getByPlaceholderText('Как тебя звать?'), { target: { value: 'Вася' } });
    fireEvent.change(screen.getByPlaceholderText('только латиница, без пробелов'), { target: { value: 'vasya' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '12345' } });
    fireEvent.click(screen.getByText('Создать аккаунт →'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Пароль минимум 6 символов'));
  });
});

describe('переписка и аккаунт', () => {
  it('без взаимной дружбы писать нельзя', async () => {
    seedUser('nova', 'secret1'); seedUser('kira', 'x'); localStorage.setItem('pp_session', 'nova');
    state.friends.add('nova>kira'); // kira в ответ не добавила
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('KIRA'));
    fireEvent.click(screen.getByText('KIRA'));
    const inp = await screen.findByPlaceholderText('Переписка пока закрыта');
    expect((inp as HTMLTextAreaElement).disabled).toBe(true);
  });
  it('входящая заявка в друзья видна и принимается «в ответ»', async () => {
    seedUser('nova', 'secret1'); seedUser('kira', 'x'); localStorage.setItem('pp_session', 'nova');
    state.friends.add('kira>nova');
    mount();
    await waitFor(() => screen.getByText('Друзья'));
    fireEvent.click(screen.getByText('Друзья'));
    await waitFor(() => screen.getByText('Добавили тебя'));
    fireEvent.click(screen.getByText('+ В ответ'));
    await waitFor(() => expect(state.friends.has('nova>kira')).toBe(true));
  });
  it('удаление аккаунта требует пароль', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    mount();
    await waitFor(() => screen.getByText('Настройки'));
    fireEvent.click(screen.getByText('Настройки'));
    await waitFor(() => screen.getByText('Удалить аккаунт'));
    fireEvent.click(screen.getByText('Удалить аккаунт'));
    const pw = await screen.findByLabelText('Пароль для подтверждения');
    fireEvent.click(screen.getByText('Удалить навсегда'));
    await waitFor(() => screen.getByText('Введи пароль для подтверждения'));
    fireEvent.change(pw, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Удалить навсегда'));
    await waitFor(() => screen.getByText(/проверь пароль/));
    expect(state.users['nova']).toBeTruthy();
    fireEvent.change(pw, { target: { value: 'secret1' } });
    fireEvent.click(screen.getByText('Удалить навсегда'));
    await waitFor(() => expect(state.users['nova']).toBeUndefined());
    await waitFor(() => screen.getByText('Войти →')); // вернулись на экран входа
  });
  it('предупреждение администрации показывается окном, пока не подтвердят', async () => {
    seedUser('nova', 'secret1'); localStorage.setItem('pp_session', 'nova');
    state.warnings.push({ username: 'nova', text: 'не флудить', at: Date.now(), seen: false });
    mount();
    await waitFor(() => screen.getByText('не флудить'));
    fireEvent.click(screen.getByText('Понятно'));
    await waitFor(() => expect(screen.queryByText('не флудить')).toBeNull());
  });
});
