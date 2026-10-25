/// <reference types="vite/client" />

// React 18 ещё не знает про нативный атрибут popover — объявляем сами.
import 'react';
declare module 'react' {
  interface HTMLAttributes<T> {
    popover?: 'auto' | 'manual' | '';
  }
}
