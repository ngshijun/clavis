import { describe, expect, it } from 'vitest';
import { bestOf, starsOf, starTargets } from './stars.js';

describe('starTargets', () => {
	it('asks for half, four fifths and all of the marks', () => {
		expect(starTargets(10)).toEqual([5, 8, 10]);
		expect(starTargets(20)).toEqual([10, 16, 20]);
	});

	it('rounds a share between two marks up to a whole mark', () => {
		expect(starTargets(12)).toEqual([6, 10, 12]);
		expect(starTargets(13)).toEqual([7, 11, 13]);
	});

	it('is exact where the share is a whole mark', () => {
		// 15 × 0.8 is a hair over 12 in floating point, which must not become 13.
		expect(starTargets(15)).toEqual([8, 12, 15]);
	});

	it('keeps each star a mark below the next on a short stage', () => {
		expect(starTargets(5)).toEqual([3, 4, 5]);
		expect(starTargets(4)).toEqual([2, 3, 4]);
		expect(starTargets(3)).toEqual([1, 2, 3]);
	});

	it('asks for a mark at the least where a stage is too short for three targets', () => {
		expect(starTargets(2)).toEqual([1, 1, 2]);
		expect(starTargets(1)).toEqual([1, 1, 1]);
	});
});

describe('starsOf', () => {
	it('gives none below half the marks', () => {
		expect(starsOf(0, 12)).toBe(0);
		expect(starsOf(5.5, 12)).toBe(0);
	});

	it('gives a star for each target reached', () => {
		expect(starsOf(6, 12)).toBe(1);
		expect(starsOf(9.5, 12)).toBe(1);
		expect(starsOf(10, 12)).toBe(2);
		expect(starsOf(11.67, 12)).toBe(2);
		expect(starsOf(12, 12)).toBe(3);
	});

	it('gives three only for every mark, however short the stage', () => {
		expect(starsOf(3, 4)).toBe(2);
		expect(starsOf(3.67, 4)).toBe(2);
		expect(starsOf(4, 4)).toBe(3);
	});
});

describe('bestOf', () => {
	it('is undefined for no session', () => {
		expect(bestOf([])).toBeUndefined();
	});

	it('is the session with the largest share of its marks', () => {
		const sessions = [
			{ marks: 9, total: 12 },
			{ marks: 8, total: 10 },
			{ marks: 5, total: 12 }
		];
		expect(bestOf(sessions)).toBe(sessions[1]);
	});

	it('is the first of those that tie', () => {
		const sessions = [
			{ marks: 6, total: 12, at: 'later' },
			{ marks: 6, total: 12, at: 'earlier' }
		];
		expect(bestOf(sessions)?.at).toBe('later');
	});
});
