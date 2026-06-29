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
import { AccessLevel } from '$lib/services/case-access.service';
import type { ApiOptions } from '$lib/services/api.service';

export const CASE_ACCESS_CTX = Symbol('case-access');

type Status = 'idle' | 'loading' | 'error';

export const createCaseAccessContext = (getCaseId: () => number | null) => {
	const state = $state<{
		level: CaseAccessLevel | null;
		status: Status;
		ready: boolean;
		error: string | null;
	}>({
		level: null,
		status: 'idle',
		ready: false,
		error: null
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

	return {
		state,
		level,
		ready,
		canRead,
		canEdit,
		isReadOnly,
		isDenied,
		load,
		reset
	};
};

export type CaseAccessContext = ReturnType<typeof createCaseAccessContext>;
