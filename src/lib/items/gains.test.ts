import { describe, expect, it } from 'vitest';
import { starsHeld, starsSince, streakOf } from './gains.js';

/** A moment where the tests run, as a session records it. */
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const session = (marks: number, day: number) => ({ marks, total: 10, completedAt: at(day) });

describe('starsHeld', () => {
	const attempts = {
		fractions: [session(10, 8), session(5, 6)],
		decimals: [session(8, 7)],
		ratios: [session(2, 7)]
	};

	it('adds the stars of the best session of each stage', () => {
		expect(starsHeld(attempts)).toBe(5);
	});

	it('counts only what was finished before a moment', () => {
		expect(starsHeld(attempts, Date.parse(at(8, 0)))).toBe(3);
		expect(starsHeld(attempts, Date.parse(at(6, 0)))).toBe(0);
	});
});

describe('starsSince', () => {
	it('counts a star once, when it was first earned', () => {
		const attempts = { fractions: [session(10, 8), session(10, 7), session(5, 6)] };
		expect(starsSince(attempts, Date.parse(at(8, 0)))).toBe(0);
		expect(starsSince(attempts, Date.parse(at(7, 0)))).toBe(2);
	});
});

describe('streakOf', () => {
	it('counts the days in a row up to today', () => {
		expect(streakOf([at(8, 9), at(8, 15), at(7), at(6), at(4)], new Date(2026, 9, 8, 18))).toBe(3);
	});

	it('keeps yesterday’s run through a day not yet practised on', () => {
		expect(streakOf([at(7), at(6)], new Date(2026, 9, 8, 7))).toBe(2);
	});

	it('is nothing once a whole day was missed', () => {
		expect(streakOf([at(6), at(5)], new Date(2026, 9, 8, 7))).toBe(0);
	});
});
