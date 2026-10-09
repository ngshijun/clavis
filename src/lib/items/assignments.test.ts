import { describe, expect, it } from 'vitest';
import { byDue, isLate, sinceAssigned } from './assignments.js';

describe('sinceAssigned', () => {
	const sessions = [
		{ completedAt: '2026-10-08T07:00:00.5+00:00' },
		{ completedAt: '2026-10-06T07:00:00+00:00' },
		{ completedAt: '2026-10-02T07:00:00+00:00' }
	];

	it('keeps the sessions finished at or after the moment of assigning', () => {
		expect(sinceAssigned(sessions, '2026-10-06T07:00:00+00:00')).toEqual(sessions.slice(0, 2));
	});

	it('reads moments written in different ways as the moments they are', () => {
		// 15:00 at +08:00 is 07:00 UTC.
		expect(sinceAssigned(sessions, '2026-10-06T15:00:00+08:00')).toEqual(sessions.slice(0, 2));
		expect(sinceAssigned(sessions, '2026-10-08T07:00:00.25Z')).toEqual(sessions.slice(0, 1));
	});

	it('is empty when nothing was finished since', () => {
		expect(sinceAssigned(sessions, '2026-10-09T00:00:00Z')).toEqual([]);
	});
});

describe('isLate', () => {
	it('is late only after the due moment', () => {
		expect(isLate('2026-10-12T16:00:00Z', '2026-10-12T15:59:59.999Z')).toBe(true);
		expect(isLate('2026-10-12T15:59:59.999Z', '2026-10-12T15:59:59.999Z')).toBe(false);
		expect(isLate('2026-10-10T08:00:00Z', '2026-10-12T15:59:59.999Z')).toBe(false);
	});

	it('is never late with no due date', () => {
		expect(isLate('2026-10-12T16:00:00Z', null)).toBe(false);
	});
});

describe('byDue', () => {
	it('puts the soonest due first, then what has no due date by how long it has been assigned', () => {
		const work = [
			{ id: 'undated, newer', dueAt: null, assignedAt: '2026-10-07T00:00:00Z' },
			{ id: 'due later', dueAt: '2026-10-15T00:00:00Z', assignedAt: '2026-10-01T00:00:00Z' },
			{ id: 'undated, older', dueAt: null, assignedAt: '2026-10-03T00:00:00Z' },
			{ id: 'overdue', dueAt: '2026-10-02T00:00:00Z', assignedAt: '2026-10-05T00:00:00Z' }
		];
		expect(work.sort(byDue).map((each) => each.id)).toEqual([
			'overdue',
			'due later',
			'undated, older',
			'undated, newer'
		]);
	});
});
