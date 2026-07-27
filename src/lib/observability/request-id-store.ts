// Track the last `X-Request-Id` echoed by the backend on any API
// response. Two consumers:
//   * Sentry — tagged as `request_id` on the current scope so a
//     browser exception can be paired with the server's crash event.
//   * The manual bug-report dialog (PR4) — attaches the id to the
//     report so support can correlate.
//
// Deliberately a bare module ref rather than a Svelte store: reads
// are frequent (every fetch) and no component needs to react.

let lastRequestId: string | null = null;

export function setLastRequestId(value: string | null): void {
	if (!value) return;
	lastRequestId = value;
	// Best-effort Sentry tag — the SDK may not be loaded yet on
	// early boot, so guard behind a try/catch instead of blocking.
	if (typeof window !== 'undefined') {
		import('@sentry/sveltekit')
			.then((sentry) => sentry.setTag('request_id', value))
			.catch(() => {
				/* SDK not installed / disabled */
			});
	}
}

export function getLastRequestId(): string | null {
	return lastRequestId;
}
