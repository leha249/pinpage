import { Component, type ReactNode } from 'react';

interface State { failed: boolean }

/** Не даёт приложению превратиться в белый экран: при ошибке рендера показываем понятное сообщение. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('PinPage: ошибка отображения', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div id="loading-screen" role="alert">
        <p>Что-то пошло не так при отображении страницы.</p>
        <button className="auth-btn" style={{ maxWidth: 220 }} onClick={() => location.reload()}>Перезагрузить</button>
      </div>
    );
  }
}
