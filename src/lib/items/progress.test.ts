import { describe, expect, it } from 'vitest';
import { standingOf, summaryOf, tallyOf } from './progress.js';

const session = (marks: number, total: number, completedAt: string) => ({
	marks,
	total,
	completedAt
});

describe('standingOf', () => {
	it('is undefined for a stage that was not practised', () => {
		expect(standingOf([])).toBeUndefined();
	});

	it('takes the best session, counts them all and keeps the latest moment', () => {
		const sessions = [
			session(6, 12, '2026-10-08T07:00:00Z'),
			session(10, 12, '2026-10-06T07:00:00Z'),
			session(5, 12, '2026-10-02T07:00:00Z')
		];
		expect(standingOf(sessions)).toEqual({
			best: sessions[1],
			stars: 2,
			attempts: 3,
			last: '2026-10-08T07:00:00Z'
		});
	});
});

describe('tallyOf', () => {
	it('counts the students at each number of stars and those who have not practised', () => {
		const standings = [
			standingOf([session(12, 12, '2026-10-01T00:00:00Z')]),
			standingOf([session(10, 12, '2026-10-01T00:00:00Z')]),
			standingOf([session(11, 12, '2026-10-01T00:00:00Z')]),
			standingOf([session(2, 12, '2026-10-01T00:00:00Z')]),
			undefined
		];
		expect(tallyOf(standings)).toEqual({ stars: [1, 0, 2, 1], unpractised: 1 });
	});

	it('is all zeros for a class of nobody', () => {
		expect(tallyOf([])).toEqual({ stars: [0, 0, 0, 0], unpractised: 0 });
	});
});

describe('summaryOf', () => {
	it('adds up the stages practised, their stars and every session', () => {
		const standings = [
			standingOf([session(13, 13, '2026-10-03T00:00:00Z'), session(9, 13, '2026-10-01T00:00:00Z')]),
			undefined,
			standingOf([session(6, 12, '2026-10-07T00:00:00Z')])
		];
		expect(summaryOf(standings)).toEqual({
			stages: 2,
			stars: 4,
			sessions: 3,
			last: '2026-10-07T00:00:00Z'
		});
	});

	it('has no last moment when nothing was practised', () => {
		expect(summaryOf([undefined, undefined])).toEqual({
			stages: 0,
			stars: 0,
			sessions: 0,
			last: undefined
		});
	});
});
