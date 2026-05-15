import { page } from '$app/state';

export const getSharedEventUrl = (eventId: number) => {
	const url = new URL(page.url);

	return `${url.origin}/case/${page.params.case_id}/timeline/?sharedEventId=${eventId}`;
};
