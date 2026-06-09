import { page } from '$app/state';

export const getSharedEventUrl = (eventId: number) => {
	const url = new URL(page.url);

	return `${url.origin}/case/${page.params.case_id}/timeline/?sharedEventId=${eventId}`;
};

export const getSharedEventId = (): number => Number(page.url.searchParams.get('sharedEventId'));

export const toSingleValue = (value: string | string[]) =>
	Array.isArray(value) ? (value[0] ?? '') : value;
