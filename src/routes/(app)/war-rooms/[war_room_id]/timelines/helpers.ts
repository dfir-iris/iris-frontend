import { page } from '$app/state';

/** URL that deep-links back to a specific event on this timeline. Used
 *  by the "copy shared link" affordance in the card's three-dot menu.
 *  Mirror of `case/[case_id]/timeline/helpers.ts`. */
export const getSharedEventUrl = (eventId: number | string) => {
	const url = new URL(page.url);

	return `${url.origin}/war-rooms/${page.params.war_room_id}/timelines/?sharedEventId=${eventId}`;
};

/** Reads `?sharedEventId=<id>` off the current URL. Numeric string in
 *  the URL is fine — the card component compares as numbers when
 *  determining "am I the shared event". Non-numeric / missing → NaN,
 *  which never matches a real event id. */
export const getSharedEventId = (): number => Number(page.url.searchParams.get('sharedEventId'));

export const toSingleValue = (value: string | string[]) =>
	Array.isArray(value) ? (value[0] ?? '') : value;
