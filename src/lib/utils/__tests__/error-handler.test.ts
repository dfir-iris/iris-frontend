import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from '../error-handler';

describe('apiErrorMessage()', () => {
	it('prefers the message of the JSON error body', () => {
		expect(apiErrorMessage({ data: { message: 'Stage is in use by 2 asset(s)' } }, 'x')).toBe(
			'Stage is in use by 2 asset(s)'
		);
	});

	it('falls back to the network error, then to the fallback', () => {
		expect(apiErrorMessage({ data: '', error: { message: 'Network request failed' } }, 'x')).toBe(
			'Network request failed'
		);
		expect(apiErrorMessage({ data: { message: '' } }, 'Fallback')).toBe('Fallback');
		expect(apiErrorMessage({ data: null }, 'Fallback')).toBe('Fallback');
	});
});
