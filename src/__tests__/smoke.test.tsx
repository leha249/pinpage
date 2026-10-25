// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { AppProvider } from '../context/AppContext';
import App from '../App';

beforeEach(() => { localStorage.clear(); });
afterEach(() => cleanup());

describe('PinPage smoke', () => {
  it('показывает экран входа без сессии', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => expect(screen.getByText('PinPage')).toBeTruthy());
    expect(screen.getByText('Войти →')).toBeTruthy();
    expect(screen.getByText('Регистрация')).toBeTruthy();
  });

  it('переключается на регистрацию и показывает поле имени', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('Регистрация'));
    fireEvent.click(screen.getByText('Регистрация'));
    expect(screen.getByPlaceholderText('Как тебя звать?')).toBeTruthy();
    expect(screen.getByText('Создать аккаунт →')).toBeTruthy();
  });

  it('валидирует пустую форму', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('Войти →'));
    fireEvent.click(screen.getByText('Войти →'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Заполни все поля'));
  });

  it('переключает показ пароля', async () => {
    render(<AppProvider><App /></AppProvider>);
    await waitFor(() => screen.getByText('Показать'));
    const pw = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByText('Показать'));
    expect(pw.type).toBe('text');
  });
});
