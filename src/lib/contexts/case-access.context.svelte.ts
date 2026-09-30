/**
 * Per-case access state. Loaded from `GET /api/v2/cases/{id}/access/me`
 * once per case view and consumed across every case sub-route to gate
 * edit/create/delete affordances before the backend has to 403.
 *
 * The hierarchy mirrors the backend `CaseAccessLevel` enum:
 *   1 = deny_all   → render nothing useful (route guards normally redirect)
 *   2 = read_only  → fields visible but disabled, no edit/add/delete buttons
 *   4 = full       → everything available
 */
import { CaseService, type CaseAccessLevel } from '$lib/services/case.service';
import { AccessLevel } from '$lib/services/access-control.service';
import type { ApiOptions } from '$lib/services/api.service';

export const CASE_ACCESS_CTX = Symbol('case-access');

type Status = 'idle' | 'loading' | 'error';

export const createCaseAccessContext = (getCaseId: () => number | null) => {
	const state = $state<{
		level: CaseAccessLevel | null;
		status: Status;
		ready: boolean;
		error: string | null;
		// HTTP status of the last lookup, so the case layout can tell "no
		// such case" (404) and "not yours" (200 + deny_all, or 403) apart
		// from a failed request, which also lands on deny_all above.
		httpStatus: number | null;
	}>({
		level: null,
		status: 'idle',
		ready: false,
		error: null,
		httpStatus: null
	});

	let inflight: Promise<void> | null = null;
	let lastLoadedCaseId: number | null = null;

	const load = (options: ApiOptions = {}): Promise<void> => {
		const id = getCaseId();
		if (id === null || !Number.isFinite(id)) return Promise.resolve();
		if (inflight && lastLoadedCaseId === id) return inflight;

		state.status = 'loading';
		state.error = null;

		inflight = (async () => {
			try {
				const res = await CaseService.getMyAccess(id, options);
				state.httpStatus = res.status;
				if (res.ok && res.data && typeof res.data === 'object') {
					state.level = res.data.access_level;
				} else {
					// Backend treats absence of an effective-access row as deny.
					// Treat any non-ok here the same way so the UI defaults to
					// locked-down rather than leaking edit affordances.
					state.level = AccessLevel.DENY_ALL as CaseAccessLevel;
					state.error = res.error?.message ?? null;
				}
				state.status = 'idle';
			} catch (e) {
				state.httpStatus = null;
				state.level = AccessLevel.DENY_ALL as CaseAccessLevel;
				state.status = 'error';
				state.error = e instanceof Error ? e.message : 'Failed to load case access';
			} finally {
				state.ready = true;
				lastLoadedCaseId = id;
				inflight = null;
			}
		})();

		return inflight;
	};

	const reset = () => {
		state.level = null;
		state.status = 'idle';
		state.ready = false;
		state.error = null;
		state.httpStatus = null;
		inflight = null;
		lastLoadedCaseId = null;
	};

	const level = $derived(() => state.level);
	const ready = $derived(() => state.ready);
	const canRead = $derived(
		() => state.level === AccessLevel.READ_ONLY || state.level === AccessLevel.FULL_ACCESS
	);
	const canEdit = $derived(() => state.level === AccessLevel.FULL_ACCESS);
	const isReadOnly = $derived(() => state.level === AccessLevel.READ_ONLY);
	const isDenied = $derived(() => state.level === AccessLevel.DENY_ALL || state.level === null);
	// Why the case cannot be shown at all, once the lookup has answered:
	// `null` while loading or when the case is readable. Only an explicit
	// answer from the backend counts — a network failure or 5xx is
	// 'error', not a claim that the analyst lacks access.
	const unavailable = $derived((): 'not-found' | 'denied' | 'error' | null => {
		if (!state.ready) return null;
		if (state.httpStatus === 404) return 'not-found';
		if (state.httpStatus === 403) return 'denied';
		if (state.httpStatus !== null && state.httpStatus >= 200 && state.httpStatus < 300) {
			return state.level === AccessLevel.DENY_ALL ? 'denied' : null;
		}
		return 'error';
	});

	return {
		state,
		level,
		ready,
		canRead,
		canEdit,
		isReadOnly,
		isDenied,
		unavailable,
		load,
		reset
	};
};

export type CaseAccessContext = ReturnType<typeof createCaseAccessContext>;
