import type { CSSProperties, ReactNode } from 'react';
import type { User } from '../types';

type AvatarUser = Pick<User, 'username' | 'color' | 'avatar' | 'avatarImg'>;

interface Props {
  user: AvatarUser;
  size?: number;
  onClick?: () => void;
  title?: string;
  children?: ReactNode;
}

export default function Avatar({ user, size = 40, onClick, title, children }: Props) {
  const style: CSSProperties = {
    width: size, height: size,
    background: `color-mix(in oklab, ${user.color} 18%, transparent)`,
    border: `2px solid ${user.color}`,
    fontSize: size * 0.38, color: user.color,
    position: 'relative', overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
  };
  return (
    <div className="av" style={style} onClick={onClick} title={title}>
      {user.avatarImg
        ? <img src={user.avatarImg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : (user.avatar || user.username[0]?.toUpperCase())}
      {children}
    </div>
  );
}
