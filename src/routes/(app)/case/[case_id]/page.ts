import { CaseService } from '$lib/services/case.service';
import type { LayoutLoad } from './$types';

export const load = (async ({ params, fetch }) => {
	const caseId = parseInt(params.case_id);

	return {
		caseId: caseId,
		case: CaseService.get(caseId, { fetch })
	};
}) satisfies LayoutLoad;
