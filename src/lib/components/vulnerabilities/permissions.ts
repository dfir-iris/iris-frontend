/**
 * UI gates for catalogue entries, mirroring the backend:
 *
 * - `vulnerabilities_read` reads any vulnerability data (catalogue,
 *   findings, war-room matrix), on top of the case / registry access;
 * - `vulnerabilities_create` (with read) adds entries, records findings
 *   and tracks entries on war rooms;
 * - the creator (while holding create), holders of `vulnerabilities_write`
 *   and server admins edit;
 * - only server admins delete and merge.
 *
 * The API enforces all of this; these only keep the UI from offering an
 * action that would bounce.
 */
import type { UserCtx } from '$lib/contexts/user-context.context.svelte';
import type { Vulnerability } from '$lib/services/vulnerabilities.service';

type Gate = Pick<UserCtx, 'can' | 'ctx'>;

export const canReadVulnerabilities = (user: Gate): boolean =>
	user.can('server_administrator') || user.can('vulnerabilities_read');

export const canCreateVulnerability = (user: Gate): boolean =>
	user.can('server_administrator') ||
	(user.can('vulnerabilities_read') && user.can('vulnerabilities_create'));

export const canAdministerVulnerabilities = (user: Gate): boolean =>
	user.can('server_administrator');

export function canEditVulnerability(
	user: Gate,
	vulnerability: Pick<Vulnerability, 'created_by_id'> | null | undefined
): boolean {
	if (!vulnerability) return false;
	if (user.can('server_administrator') || user.can('vulnerabilities_write')) return true;
	const me = user.ctx?.user_id;
	return (
		canCreateVulnerability(user) &&
		me !== undefined &&
		me !== 0 &&
		vulnerability.created_by_id === me
	);
}

/**
 * Findings on a case asset or a registry asset: the scope's own write
 * access (case full access, `asset_manager_write`) plus create.
 */
export const canWriteFindings = (user: Gate, scopeWritable: boolean): boolean =>
	scopeWritable && canCreateVulnerability(user);

/**
 * Detail views carrying a Vulnerabilities tab: once permissions are
 * known, a user without read who lands on that tab (e.g. via
 * `?tab=vulnerabilities`) is moved to `fallback`. Before they are known
 * the tab is kept so a reader isn't bounced on first paint.
 */
export function vulnerabilityTabFallback(
	tab: string,
	canRead: boolean,
	ready: boolean,
	fallback = 'details'
): string {
	if (tab !== 'vulnerabilities' || canRead || !ready) return tab;
	return fallback;
}
