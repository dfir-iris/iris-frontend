export const normalizeTags = (csv: string): string[] =>
	csv
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t.length > 0);

export const CASE_ACCESS_NOT_MANAGER =
	'Changing who can access this case needs the case_access_manage permission and full access to the case.';
export const CASE_ACCESS_OWN_ROW = 'You cannot change your own access to a case.';

// Why a row of the case access table is read-only, or null when it is
// editable. Mirrors the checks of `POST /api/v2/cases/{id}/access/users`.
export const caseAccessLockReason = (
	canManage: boolean,
	rowUserId: number | undefined,
	myUserId: number | null
): string | null => {
	if (!canManage) return CASE_ACCESS_NOT_MANAGER;
	if (myUserId !== null && rowUserId === myUserId) return CASE_ACCESS_OWN_ROW;
	return null;
};
