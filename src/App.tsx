import { lazy, Suspense } from 'react';
import { useApp } from './context/AppContext';
import { useSession } from './hooks/useSession';
import { ADMIN_USERNAME } from './types';
import AuthScreen from './components/AuthScreen';
import Nav from './components/Nav';
import Toast from './components/Toast';
import Lightbox from './components/Lightbox';
import WarningNotice from './components/WarningNotice';
import ErrorBoundary from './components/ErrorBoundary';

// Тяжёлые экраны грузятся по требованию — быстрее первый запуск.
const Wall = lazy(() => import('./components/Wall/Wall'));
const FriendsChat = lazy(() => import('./components/Friends/FriendsChat'));
const Settings = lazy(() => import('./components/Settings'));
const Changelog = lazy(() => import('./components/Changelog'));
const AdminPanel = lazy(() => import('./components/Admin/AdminPanel'));

const Loading = () => (
  <div id="loading-screen"><div className="loader" /><p>Загружаем...</p></div>
);

export default function App() {
  const { currentUser, tab } = useApp();
  const { booting, offline, retry } = useSession();

  let view;
  if (booting) view = <Loading />;
  else if (!currentUser && offline) {
    view = (
      <div id="loading-screen" role="alert">
        <p>Нет связи с сервером. Ты не вышел из аккаунта — просто повтори попытку.</p>
        <button className="auth-btn" style={{ maxWidth: 220 }} onClick={retry}>Повторить</button>
      </div>
    );
  } else if (!currentUser) view = <AuthScreen />;
  else {
    view = (
      <Suspense fallback={<Loading />}>
        {tab === 'wall' && <Wall />}
        {tab === 'friends' && <FriendsChat />}
        {tab === 'changelog' && <Changelog />}
        {tab === 'settings' && <Settings />}
        {tab === 'admin' && currentUser.username === ADMIN_USERNAME && <AdminPanel />}
      </Suspense>
    );
  }

  return (
    <div id="app">
      {currentUser && !booting && <Nav />}
      <div id="main" style={{ overflow: tab === 'settings' || tab === 'changelog' || tab === 'admin' ? 'auto' : 'hidden' }}>
        <ErrorBoundary>{view}</ErrorBoundary>
      </div>
      <Toast />
      {currentUser && <WarningNotice />}
      <Lightbox />
    </div>
  );
}
