/**
 * The per-user view of the case timeline: the event cards, or the
 * search view (histogram, search bar and one row per event).
 *
 * Switching view on the timeline page records the choice, so the next
 * case opens on the view the analyst last worked in. Stored in the
 * per-user `preferences` JSONB bag (`PUT /manage/users/me/preferences/<key>`)
 * like the alerts' default view, so it follows the user across browsers
 * and needs no schema change.
 */

import { UsersService } from '$lib/services/users.service';

export const TIMELINE_DEFAULT_VIEW_PREF_KEY = 'timeline_default_view';

export type TimelineLayout = 'cards' | 'search';

export const TIMELINE_DEFAULT_LAYOUT: TimelineLayout = 'cards';

/** Anything the bag holds that is not a known view falls back to the cards. */
export const parseTimelineLayout = (raw: unknown): TimelineLayout =>
	raw === 'cards' || raw === 'search' ? raw : TIMELINE_DEFAULT_LAYOUT;

/** Fetch the caller's view. Never throws — falls back to the cards. */
export const loadTimelineLayout = async (): Promise<TimelineLayout> => {
	try {
		const response = await UsersService.getMyPreference(TIMELINE_DEFAULT_VIEW_PREF_KEY);

		if (!response.ok || response.data === null || typeof response.data === 'string') {
			return TIMELINE_DEFAULT_LAYOUT;
		}

		return parseTimelineLayout((response.data as { value?: unknown }).value);
	} catch {
		return TIMELINE_DEFAULT_LAYOUT;
	}
};

/** Persist the caller's view. Returns whether the write landed. */
export const saveTimelineLayout = async (layout: TimelineLayout): Promise<boolean> => {
	try {
		const response = await UsersService.setMyPreference(TIMELINE_DEFAULT_VIEW_PREF_KEY, layout);
		return response.ok === true;
	} catch {
		return false;
	}
};
