import { describe, expect, it } from 'vitest';
import { caseTargetItems, isScopeSlashCommand } from '../slash-targets';

describe('isScopeSlashCommand', () => {
	it('matches the scope commands once arguments start', () => {
		expect(isScopeSlashCommand('/asset WS-042 #')).toBe(true);
		expect(isScopeSlashCommand('/share-note Plan ')).toBe(true);
		expect(isScopeSlashCommand('/push\tx')).toBe(true);
	});

	it('ignores other commands, bare commands and plain text', () => {
		expect(isScopeSlashCommand('/task fix #')).toBe(false);
		expect(isScopeSlashCommand('/asset')).toBe(false);
		expect(isScopeSlashCommand('/assets x')).toBe(false);
		expect(isScopeSlashCommand('see /asset x')).toBe(false);
	});
});

describe('caseTargetItems', () => {
	const cases = [
		{ case_id: 12, case_name: 'Ransomware HQ' },
		{ case_id: 125, case_name: 'Phishing wave' },
		{ case_id: 3, case_name: null }
	];

	it('lists every attached case for an empty query', () => {
		expect(caseTargetItems(cases, '').map((c) => c.insertion)).toEqual(['#12', '#125', '#3']);
	});

	it('filters by id prefix, case- prefix or name', () => {
		expect(caseTargetItems(cases, '12').map((c) => c.caseId)).toEqual([12, 125]);
		expect(caseTargetItems(cases, 'case-3').map((c) => c.caseId)).toEqual([3]);
		expect(caseTargetItems(cases, 'phish').map((c) => c.caseId)).toEqual([125]);
	});

	it('builds the label and the bare target token', () => {
		expect(caseTargetItems(cases, '3')[0]).toEqual({
			caseId: 3,
			label: 'Case #3',
			sublabel: '',
			insertion: '#3'
		});
	});
});
