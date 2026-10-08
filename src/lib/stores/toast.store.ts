import { writable } from 'svelte/store';

export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

export interface Toast {
	id: string;
	title: string;
	description?: string;
	variant?: ToastVariant;
	duration?: number;
	/** Optional in-app link rendered under the description. */
	link?: { href: string; label: string };
}

/**
 * True for a same-origin, path-absolute href (`/cases/1`). Rejects
 * protocol-relative `//host`, the `/\\host` variant browsers normalise to
 * `//host`, schemes (`javascript:`, `https:`) and relative paths.
 */
export function toastIsSafeHref(href: unknown): href is string {
	if (typeof href !== 'string' || !href.startsWith('/')) return false;
	const second = href.charAt(1);
	if (second === '/' || second === '\\') return false;
	// Control characters / whitespace could be stripped by the URL parser
	// and turn `/\t/host` into `//host`.
	// eslint-disable-next-line no-control-regex
	return !/[\u0000-\u001f\u007f\s]/.test(href);
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function addToast(toast: Omit<Toast, 'id'>) {
		const id = crypto.randomUUID();
		const duration = toast.duration || 5000;
		const { link, ...rest } = toast;
		const entry: Toast = { id, ...rest };
		if (link && toastIsSafeHref(link.href)) entry.link = link;

		update((toasts) => [...toasts, entry]);

		if (duration > 0) {
			setTimeout(() => {
				dismissToast(id);
			}, duration);
		}

		return id;
	}

	function dismissToast(id: string) {
		update((toasts) => toasts.filter((toast) => toast.id !== id));
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
