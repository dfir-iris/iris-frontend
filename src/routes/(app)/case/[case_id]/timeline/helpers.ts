import { page } from '$app/state';
import { graphUrl, highlightedEventIds } from '$lib/utils/graph-links';

export const getSharedEventUrl = (eventId: number) => {
	const url = new URL(page.url);

	return `${url.origin}/case/${page.params.case_id}/timeline/?sharedEventId=${eventId}`;
};

export const getSharedEventId = (): number => Number(page.url.searchParams.get('sharedEventId'));

/** Events highlighted by the URL: `sharedEventId` and the graph's `events` list. */
export const getHighlightedEventIds = (): number[] => highlightedEventIds(page.url.searchParams);

/** Investigation graph of the case, selecting what the given events link. */
export const getGraphUrlForEvents = (eventIds: number[]) =>
	graphUrl(Number(page.params.case_id), { events: eventIds });

export const toSingleValue = (value: string | string[]) =>
	Array.isArray(value) ? (value[0] ?? '') : value;
