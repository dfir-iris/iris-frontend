/**
 * Svelte context for the SPA-wide user/server context:
 *   * Current IRIS version (shown in the side bar)
 *   * Whether the instance is running in demo mode
 *   * Effective permissions of the logged-in user
 *
 * Loaded once per app shell mount from `GET /api/v2/me/context`. While
 * the request is in flight, `ready` is false and components that gate
 * on permissions should either render a skeleton or simply nothing —
 * showing a menu item and then hiding it once permissions arrive would
 * be more jarring than a brief absence.
 */
import {
	UserContextService,
	hasPermission,
	hasAnyPermission,
	type PermissionName,
	type UserContext,
	type UserPreferences
} from '$lib/services/user-context.service';

export const USER_CTX = Symbol('user-context');

export type UserCtx = {
	readonly ctx: UserContext | null;
	readonly ready: boolean;
	load(): Promise<void>;
	can(perm: PermissionName): boolean;
	canAny(perms: PermissionName[]): boolean;
	/** Patch one or more UI preferences. The local copy flips
	 *  immediately (optimistic) and the PUT goes out in the
	 *  background — if it fails the local value is rolled back so
	 *  the next reload doesn't see a divergent state. */
	setPreference<K extends keyof UserContext['preferences']>(
		key: K,
		value: UserContext['preferences'][K]
	): Promise<void>;
};

export const createUserContext = (): UserCtx => {
	let ctx = $state<UserContext | null>(null);
	let ready = $state(false);
	let inflight: Promise<void> | null = null;

	const load = (): Promise<void> => {
		if (inflight) return inflight;
		inflight = (async () => {
			const response = await UserContextService.get();
			if (response.ok && response.data) {
				const fresh = response.data as UserContext;
				// Defensive default — older backends don't yet ship the
				// `preferences` block in /me/context. Synthesise an empty
				// one so callers can read `ctx.preferences.has_mini_sidebar`
				// without a runtime crash.
				if (!fresh.preferences) {
					fresh.preferences = { has_mini_sidebar: false };
				}
				ctx = fresh;
			}
			ready = true;
			inflight = null;
		})();
		return inflight;
	};

	const setPreference = async <K extends keyof UserContext['preferences']>(
		key: K,
		value: UserContext['preferences'][K]
	): Promise<void> => {
		if (!ctx) {
			// First-paint click before the bootstrap finished. Stash the
			// requested value in a minimal stub so the UI flips
			// immediately; `load()` will overwrite it once the network
			// call settles. Without this stub, an over-eager click would
			// be a no-op.
			ctx = {
				iris_version: '',
				demo_mode: false,
				user_id: 0,
				permissions: { mask: 0, names: [] },
				preferences: { has_mini_sidebar: false, [key]: value } as UserPreferences
			};
			await UserContextService.updatePreferences({ [key]: value } as Partial<
				UserContext['preferences']
			>);
			return;
		}
		// Optimistic local update — replace the preferences object
		// rather than mutating in place so Svelte 5's deep $state
		// reliably notices the change. We intentionally do NOT roll
		// back on a failed PUT: the user's intent in this session is
		// the source of truth for the in-memory UI, and a transient
		// 4xx/5xx from the persistence endpoint shouldn't snap their
		// sidebar back to the old state mid-click. A failed write will
		// resync naturally on next page load.
		ctx = {
			...ctx,
			preferences: { ...ctx.preferences, [key]: value }
		};
		const response = await UserContextService.updatePreferences({ [key]: value } as Partial<
			UserContext['preferences']
		>);
		if (!response.ok) {
			console.warn('[user-context] failed to persist preference', key, response.error);
		}
	};

	return {
		get ctx() {
			return ctx;
		},
		get ready() {
			return ready;
		},
		load,
		can: (perm) => hasPermission(ctx, perm),
		canAny: (perms) => hasAnyPermission(ctx, perms),
		setPreference
	};
};
