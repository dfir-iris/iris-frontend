import { describe, expect, it } from 'vitest';
import {
	canAdministerVulnerabilities,
	canCreateVulnerability,
	canEditVulnerability,
	canReadVulnerabilities,
	canWriteFindings,
	vulnerabilityTabFallback
} from './permissions';

const gate = (perms: string[], userId = 7) => ({
	can: (p: string) => perms.includes(p),
	ctx: { user_id: userId }
});

// The gates only read `can` and `ctx.user_id`.
type Gate = Parameters<typeof canReadVulnerabilities>[0];
const as = (g: ReturnType<typeof gate>) => g as unknown as Gate;

describe('vulnerability permission gates', () => {
	it('reads with vulnerabilities_read or as admin only', () => {
		expect(canReadVulnerabilities(as(gate([])))).toBe(false);
		expect(canReadVulnerabilities(as(gate(['standard_user'])))).toBe(false);
		expect(canReadVulnerabilities(as(gate(['vulnerabilities_read'])))).toBe(true);
		expect(canReadVulnerabilities(as(gate(['server_administrator'])))).toBe(true);
	});

	it('creates with read and create together', () => {
		expect(canCreateVulnerability(as(gate(['vulnerabilities_create'])))).toBe(false);
		expect(canCreateVulnerability(as(gate(['vulnerabilities_read'])))).toBe(false);
		expect(
			canCreateVulnerability(as(gate(['vulnerabilities_read', 'vulnerabilities_create'])))
		).toBe(true);
		expect(canCreateVulnerability(as(gate(['server_administrator'])))).toBe(true);
	});

	it('lets the creator edit only while they can create', () => {
		const mine = { created_by_id: 7 };
		expect(canEditVulnerability(as(gate(['vulnerabilities_read'])), mine)).toBe(false);
		expect(
			canEditVulnerability(as(gate(['vulnerabilities_read', 'vulnerabilities_create'])), mine)
		).toBe(true);
		expect(
			canEditVulnerability(as(gate(['vulnerabilities_read', 'vulnerabilities_create'])), {
				created_by_id: 8
			})
		).toBe(false);
		expect(canEditVulnerability(as(gate(['vulnerabilities_write'])), { created_by_id: 8 })).toBe(
			true
		);
		expect(canEditVulnerability(as(gate(['server_administrator'])), null)).toBe(false);
	});

	it('administers as server admin only', () => {
		expect(canAdministerVulnerabilities(as(gate(['vulnerabilities_write'])))).toBe(false);
		expect(canAdministerVulnerabilities(as(gate(['server_administrator'])))).toBe(true);
	});
});

describe('canWriteFindings', () => {
	const writer = as(gate(['vulnerabilities_read', 'vulnerabilities_create']));
	it('needs the scope write access and create', () => {
		expect(canWriteFindings(writer, true)).toBe(true);
		expect(canWriteFindings(writer, false)).toBe(false);
		expect(canWriteFindings(as(gate(['vulnerabilities_read'])), true)).toBe(false);
		expect(canWriteFindings(as(gate(['server_administrator'])), true)).toBe(true);
	});
});

describe('vulnerabilityTabFallback', () => {
	it('moves readers-less users off the vulnerabilities tab once ready', () => {
		expect(vulnerabilityTabFallback('vulnerabilities', false, true)).toBe('details');
		expect(vulnerabilityTabFallback('vulnerabilities', false, true, 'general')).toBe('general');
	});

	it('keeps the tab for readers and while permissions load', () => {
		expect(vulnerabilityTabFallback('vulnerabilities', true, true)).toBe('vulnerabilities');
		expect(vulnerabilityTabFallback('vulnerabilities', false, false)).toBe('vulnerabilities');
	});

	it('leaves other tabs alone', () => {
		expect(vulnerabilityTabFallback('history', false, true)).toBe('history');
	});
});
