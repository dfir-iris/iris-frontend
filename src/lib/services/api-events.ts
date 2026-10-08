/**
 * Read-only feed of the API calls `ApiService` completes in the browser.
 *
 * The guided tutorials use it to notice that the user really did the
 * thing a step asks for (created the case, attached it, …) instead of
 * guessing from clicks. Listeners must not mutate the payload; a
 * throwing listener is isolated so it can never break a request.
 */

export type ApiEvent = {
	method: string;
	/** Path without origin, query string or `/api/v2` prefix: `/cases/12/assets`. */
	path: string;
	status: number;
	ok: boolean;
	data: unknown;
};

type Listener = (event: ApiEvent) => void;

const listeners = new Set<Listener>();

export const onApiEvent = (listener: Listener): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const hasApiEventListeners = (): boolean => listeners.size > 0;

export const emitApiEvent = (event: ApiEvent): void => {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error('API event listener failed', error);
		}
	}
};

export const apiEventPath = (url: string): string => {
	let path: string;
	try {
		path = new URL(url, 'http://localhost').pathname;
	} catch {
		path = url.split('?')[0];
	}
	if (path.startsWith('/api/v2/')) path = path.slice('/api/v2'.length);
	else if (path === '/api/v2') path = '/';
	return path.length > 1 ? path.replace(/\/+$/, '') : path;
};
