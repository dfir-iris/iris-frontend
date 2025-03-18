import { writable } from 'svelte/store';

export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function addToast(toast: Omit<Toast, 'id'>) {
    const id = crypto.randomUUID();
    const duration = toast.duration || 5000;

    update(toasts => [...toasts, { id, ...toast }]);

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }

  function dismissToast(id: string) {
    update(toasts => toasts.filter(toast => toast.id !== id));
  }

  return {
    subscribe,
    add: addToast,
    dismiss: dismissToast
  };
}

export const toasts = createToastStore();

export function toast(props: Omit<Toast, 'id'>) {
  return toasts.add(props);
}