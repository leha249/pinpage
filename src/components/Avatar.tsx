import type { CSSProperties, ReactNode } from 'react';
import type { User } from '../types';
import { safeColor } from '../lib/safe';

type AvatarUser = Pick<User, 'username' | 'color' | 'avatar' | 'avatarImg'>;

interface Props {
  user: AvatarUser;
  size?: number;
  onClick?: () => void;
  title?: string;
  children?: ReactNode;
}

export default function Avatar({ user, size = 40, onClick, title, children }: Props) {
  const color = safeColor(user.color);
  const style: CSSProperties = {
    width: size, height: size,
    background: `color-mix(in oklab, ${color} 18%, transparent)`,
    border: `2px solid ${color}`,
    fontSize: size * 0.38, color,
    position: 'relative', overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
  };
  return (
    <div
      className="av" style={style} onClick={onClick} title={title}
      {...(onClick ? {
        role: 'button', tabIndex: 0, 'aria-label': title || 'Аватар',
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
      } : {})}
    >
      {user.avatarImg
        ? <img src={user.avatarImg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : (user.avatar || user.username[0]?.toUpperCase())}
      {children}
    </div>
  );
}
