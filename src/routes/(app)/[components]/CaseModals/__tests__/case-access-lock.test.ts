import { describe, it, expect } from 'vitest';
import { caseAccessLockReason, CASE_ACCESS_NOT_MANAGER, CASE_ACCESS_OWN_ROW } from '../utils';

describe('caseAccessLockReason', () => {
	it('locks every row when the caller may not manage the case access', () => {
		expect(caseAccessLockReason(false, 23, 7)).toBe(CASE_ACCESS_NOT_MANAGER);
		expect(caseAccessLockReason(false, 7, 7)).toBe(CASE_ACCESS_NOT_MANAGER);
	});

	it("locks the caller's own row", () => {
		expect(caseAccessLockReason(true, 7, 7)).toBe(CASE_ACCESS_OWN_ROW);
	});

	it('leaves the other rows editable for a manager', () => {
		expect(caseAccessLockReason(true, 23, 7)).toBeNull();
	});

	it('does not lock a row while the current user is unknown', () => {
		expect(caseAccessLockReason(true, 23, null)).toBeNull();
		expect(caseAccessLockReason(true, undefined, null)).toBeNull();
	});
});
