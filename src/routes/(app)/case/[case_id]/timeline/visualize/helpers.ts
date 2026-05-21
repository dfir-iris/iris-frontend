import { goto } from '$app/navigation';
import { page } from '$app/state';

export const visualize = (group_by?: string) => {
	const url = new URL(page.url);

	goto(
		`${url.origin}/case/${page.params.case_id}/timeline/visualize/${group_by ? '?group_by=' + group_by : ''}`
	);
};
