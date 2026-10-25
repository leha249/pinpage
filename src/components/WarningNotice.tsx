import { useApp } from '../context/AppContext';
import Modal from './Modal';

/** Предупреждения от администрации: висят окном, пока человек не подтвердит, что прочитал. */
export default function WarningNotice() {
  const { pendingWarnings, dismissWarnings } = useApp();
  return (
    <Modal open={pendingWarnings.length > 0} onClose={dismissWarnings} title="Предупреждение от администрации">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {pendingWarnings.map((w, i) => (
          <p key={i} style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{w.text}</p>
        ))}
      </div>
      <button className="auth-btn" onClick={dismissWarnings}>Понятно</button>
    </Modal>
  );
}
