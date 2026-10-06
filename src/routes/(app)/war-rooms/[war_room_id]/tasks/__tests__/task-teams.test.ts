import { describe, it, expect } from 'vitest';
import {
	matchTeams,
	normalizeTeamColor,
	sameTeamIds,
	splitTeamChips,
	teamChipStyle,
	teamDotStyle,
	teamFilterParam
} from '../task-teams';

const team = (team_id: number, name: string, color: string | null = null) => ({
	team_id,
	name,
	color
});

describe('splitTeamChips', () => {
	it('returns nothing for a missing or empty list', () => {
		expect(splitTeamChips(undefined)).toEqual({ shown: [], hidden: [], hiddenTitle: '' });
		expect(splitTeamChips([])).toEqual({ shown: [], hidden: [], hiddenTitle: '' });
	});

	it('shows every team when within the limit', () => {
		const teams = [team(1, 'blue'), team(2, 'red')];
		const r = splitTeamChips(teams);
		expect(r.shown).toEqual(teams);
		expect(r.hidden).toEqual([]);
	});

	it('collapses the overflow and lists it in the title', () => {
		const teams = [team(1, 'a'), team(2, 'b'), team(3, 'c'), team(4, 'd')];
		const r = splitTeamChips(teams);
		expect(r.shown.map((t) => t.team_id)).toEqual([1, 2]);
		expect(r.hidden.map((t) => t.team_id)).toEqual([3, 4]);
		expect(r.hiddenTitle).toBe('@c, @d');
	});

	it('honours a custom limit and clamps negatives to zero', () => {
		const teams = [team(1, 'a'), team(2, 'b')];
		expect(splitTeamChips(teams, 1).hidden).toHaveLength(1);
		expect(splitTeamChips(teams, -3).shown).toEqual([]);
	});
});

describe('normalizeTeamColor', () => {
	it('accepts 6-digit hex and lowercases it', () => {
		expect(normalizeTeamColor('#AABBCC')).toBe('#aabbcc');
	});

	it('expands 3-digit hex', () => {
		expect(normalizeTeamColor('#f0a')).toBe('#ff00aa');
	});

	it('rejects anything that is not a plain hex colour', () => {
		expect(normalizeTeamColor(null)).toBeNull();
		expect(normalizeTeamColor('')).toBeNull();
		expect(normalizeTeamColor('red')).toBeNull();
		expect(normalizeTeamColor('#12345')).toBeNull();
		expect(normalizeTeamColor('#fff; background: url(x)')).toBeNull();
	});
});

describe('teamChipStyle / teamDotStyle', () => {
	it('tints with the team colour', () => {
		expect(teamChipStyle('#112233')).toBe('border-color: #11223366; background-color: #1122331f;');
		expect(teamDotStyle('#112233')).toBe('background-color: #112233;');
	});

	it('returns an empty style for unusable colours', () => {
		expect(teamChipStyle(null)).toBe('');
		expect(teamDotStyle('javascript:alert(1)')).toBe('');
	});
});

describe('teamFilterParam', () => {
	it('is undefined when nothing is selected', () => {
		expect(teamFilterParam([])).toBeUndefined();
	});

	it('maps null to the "none" sentinel', () => {
		expect(teamFilterParam([3, null])).toEqual([3, 'none']);
	});
});

describe('sameTeamIds', () => {
	it('ignores order', () => {
		expect(sameTeamIds([1, 2], [2, 1])).toBe(true);
	});

	it('detects additions and removals', () => {
		expect(sameTeamIds([1], [1, 2])).toBe(false);
		expect(sameTeamIds([1, 2], [1, 3])).toBe(false);
		expect(sameTeamIds([], [])).toBe(true);
	});
});

describe('matchTeams', () => {
	const teams = [team(1, 'Network'), team(2, 'Forensics')];

	it('returns everything for a blank needle', () => {
		expect(matchTeams(teams, '  ')).toEqual(teams);
	});

	it('matches case-insensitively on the name', () => {
		expect(matchTeams(teams, 'net').map((t) => t.team_id)).toEqual([1]);
	});
});
