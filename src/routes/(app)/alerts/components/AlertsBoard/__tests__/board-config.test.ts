import { describe, it, expect } from 'vitest';
import {
	isAlertViewMode,
	isAlertBoardGroup,
	isTerminalStatusName,
	rankOf,
	SEVERITY_RANK,
	STATUS_RANK
} from '../board-config';

describe('isAlertViewMode', () => {
	it('accepts list', () => expect(isAlertViewMode('list')).toBe(true));
	it('accepts board', () => expect(isAlertViewMode('board')).toBe(true));
	it('accepts split', () => expect(isAlertViewMode('split')).toBe(true));
	it('rejects unknown', () => expect(isAlertViewMode('graph')).toBe(false));
	it('rejects undefined', () => expect(isAlertViewMode(undefined)).toBe(false));
	it('rejects null', () => expect(isAlertViewMode(null)).toBe(false));
});

describe('isAlertBoardGroup', () => {
	it('accepts severity', () => expect(isAlertBoardGroup('severity')).toBe(true));
	it('accepts status', () => expect(isAlertBoardGroup('status')).toBe(true));
	it('rejects unknown', () => expect(isAlertBoardGroup('customer')).toBe(false));
});

describe('isTerminalStatusName', () => {
	it('marks closed as terminal', () => expect(isTerminalStatusName('closed')).toBe(true));
	it('marks merged as terminal', () => expect(isTerminalStatusName('merged')).toBe(true));
	it('marks escalated as terminal', () => expect(isTerminalStatusName('escalated')).toBe(true));
	it('is case-insensitive', () => expect(isTerminalStatusName('Closed')).toBe(true));
	it('handles whitespace', () => expect(isTerminalStatusName('  merged  ')).toBe(true));
	it('marks new as non-terminal', () => expect(isTerminalStatusName('new')).toBe(false));
	it('handles null', () => expect(isTerminalStatusName(null)).toBe(false));
	it('handles undefined', () => expect(isTerminalStatusName(undefined)).toBe(false));
});

describe('rankOf', () => {
	it('returns rank for known severity', () => expect(rankOf(SEVERITY_RANK, 'critical')).toBe(0));
	it('returns rank for known status', () => expect(rankOf(STATUS_RANK, 'new')).toBe(0));
	it('returns 50 for unknown severity', () => expect(rankOf(SEVERITY_RANK, 'custom')).toBe(50));
	it('returns 90 for unspecified', () => expect(rankOf(SEVERITY_RANK, 'unspecified')).toBe(90));
	it('is case-insensitive', () => expect(rankOf(SEVERITY_RANK, 'CRITICAL')).toBe(0));
});
