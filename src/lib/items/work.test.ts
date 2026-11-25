import { describe, expect, it } from 'vitest';
import { sessionsOf, toDoOf, workOf } from './work.js';

const stops = { fractions: 'Fractions', decimals: 'Decimals' };

describe('workOf', () => {
	it('puts each assignment beside its stage, in the order given', () => {
		const work = workOf([{ stageId: 'decimals' }, { stageId: 'fractions' }], stops);
		expect(work.map((each) => each.stop)).toEqual(['Decimals', 'Fractions']);
	});

	it('leaves out an assignment of a stage that can no longer be practised', () => {
		expect(workOf([{ stageId: 'gone' }, { stageId: 'fractions' }], stops)).toEqual([
			{ assignment: { stageId: 'fractions' }, stop: 'Fractions' }
		]);
	});
});

describe('toDoOf', () => {
	const assigned = (id: string, dueAt: string | null, doneAt: string | null = null) => ({
		assignment: { id, dueAt, doneAt, assignedAt: '2026-10-01T00:00:00Z' }
	});

	it('keeps what is not done, the soonest due first and what has no due date last', () => {
		const toDo = toDoOf([
			assigned('none', null),
			assigned('later', '2026-10-20T00:00:00Z'),
			assigned('done', '2026-10-02T00:00:00Z', '2026-10-02T08:00:00Z'),
			assigned('sooner', '2026-10-05T00:00:00Z')
		]);
		expect(toDo.map((each) => each.assignment.id)).toEqual(['sooner', 'later', 'none']);
	});
});

describe('sessionsOf', () => {
	it('lists every session beside its stage, the latest first', () => {
		const sessions = sessionsOf(
			{
				fractions: [
					{ completedAt: '2026-10-08T07:00:00Z' },
					{ completedAt: '2026-10-02T07:00:00Z' }
				],
				// 15:00 at +08:00 is 07:00 UTC.
				decimals: [{ completedAt: '2026-10-06T15:00:00+08:00' }],
				gone: [{ completedAt: '2026-10-09T07:00:00Z' }]
			},
			stops
		);
		expect(sessions.map((each) => each.stop)).toEqual(['Fractions', 'Decimals', 'Fractions']);
	});
});
