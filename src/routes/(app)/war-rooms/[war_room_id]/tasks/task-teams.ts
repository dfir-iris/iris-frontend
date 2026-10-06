/**
 * Pure helpers for showing and filtering the teams a war-room task is
 * assigned to. Kept out of the page so they can be unit-tested.
 */
import type { WarRoomTaskTeam } from '$lib/services/war-room-tasks.service';

/** How many team chips a row shows before collapsing the rest to "+N". */
export const TEAM_CHIPS_MAX = 2;

export interface TeamChipsSplit {
	shown: WarRoomTaskTeam[];
	hidden: WarRoomTaskTeam[];
	/** Comma-separated names of the hidden teams, for the "+N" tooltip. */
	hiddenTitle: string;
}

export function splitTeamChips(
	teams: WarRoomTaskTeam[] | null | undefined,
	max: number = TEAM_CHIPS_MAX
): TeamChipsSplit {
	const all = teams ?? [];
	const limit = Math.max(0, max);
	if (all.length <= limit) return { shown: all, hidden: [], hiddenTitle: '' };
	const hidden = all.slice(limit);
	return {
		shown: all.slice(0, limit),
		hidden,
		hiddenTitle: hidden.map((t) => `@${t.name}`).join(', ')
	};
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalise a team colour to `#rrggbb`, or null when it isn't a plain
 * hex colour. Team colours are free-form on the backend and end up in a
 * `style` attribute, so anything else is dropped rather than injected.
 */
export function normalizeTeamColor(color: string | null | undefined): string | null {
	const c = (color ?? '').trim();
	if (!HEX_COLOR.test(c)) return null;
	if (c.length === 4) {
		return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toLowerCase();
	}
	return c.toLowerCase();
}

/** Inline style for a chip: tinted background and border in the team colour. */
export function teamChipStyle(color: string | null | undefined): string {
	const c = normalizeTeamColor(color);
	if (!c) return '';
	return `border-color: ${c}66; background-color: ${c}1f;`;
}

/** Inline style for the small colour dot (empty → falls back to CSS). */
export function teamDotStyle(color: string | null | undefined): string {
	const c = normalizeTeamColor(color);
	return c ? `background-color: ${c};` : '';
}

/**
 * Map the page's team filter selection to the list query: `null` stands
 * for "No team" and becomes the backend's `none` sentinel.
 */
export function teamFilterParam(selected: (number | null)[]): (number | 'none')[] | undefined {
	if (!selected.length) return undefined;
	return selected.map((t) => (t === null ? ('none' as const) : t));
}

/** Order-insensitive comparison of two team-id sets. */
export function sameTeamIds(a: number[], b: number[]): boolean {
	const sa = new Set(a);
	const sb = new Set(b);
	if (sa.size !== sb.size) return false;
	for (const id of sa) if (!sb.has(id)) return false;
	return true;
}

/** Case-insensitive name filter for the team picker. */
export function matchTeams<T extends { name: string }>(teams: T[], needle: string): T[] {
	const n = needle.trim().toLowerCase();
	if (!n) return teams;
	return teams.filter((t) => t.name.toLowerCase().includes(n));
}
