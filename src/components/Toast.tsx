import { useApp } from '../context/AppContext';

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  const ok = toast.type === 'ok';
  return (
    <div
      id="notif" role={ok ? 'status' : 'alert'} key={toast.id}
      style={{
        background: ok ? 'var(--accent-bg)' : 'var(--danger-bg)',
        border: `1px solid ${ok ? 'color-mix(in oklab, var(--accent) 40%, transparent)' : 'color-mix(in oklab, var(--danger) 40%, transparent)'}`,
        color: ok ? 'var(--accent2)' : 'oklch(70% 0.19 25)',
      }}
    >
      {toast.msg}
    </div>
  );
}
