export const load = async ({ params }) => {
	const caseId = Number(params.case_id);

	return {
		caseId
	};
};
