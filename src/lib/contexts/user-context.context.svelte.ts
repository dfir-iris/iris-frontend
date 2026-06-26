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
	type UserContext
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
				ctx = response.data as UserContext;
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
		if (!ctx) return;
		const previous = ctx.preferences[key];
		// Optimistic local update — replace the preferences object
		// rather than mutating in place so Svelte 5's deep $state
		// reliably notices the change.
		ctx = {
			...ctx,
			preferences: { ...ctx.preferences, [key]: value }
		};
		const response = await UserContextService.updatePreferences({ [key]: value } as Partial<
			UserContext['preferences']
		>);
		if (!response.ok && ctx) {
			ctx = {
				...ctx,
				preferences: { ...ctx.preferences, [key]: previous }
			};
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
