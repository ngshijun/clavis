import { describe, expect, it } from 'vitest';
import {
	averagesOf,
	bandOf,
	classroomSummaryOf,
	peopleOf,
	pointsOf,
	progressOf,
	starTallyOf,
	strugglingOf,
	type Enrolment,
	type PointScore
} from './dashboard.js';

const enrolment = (classroomId: string, studentId: string, thisWeek = false, lastWeek = false) => ({
	classroomId,
	studentId,
	name: studentId,
	thisWeek,
	lastWeek
});

const score = (classroomId: string, studentId: string, pointId: string, value: number) => ({
	classroomId,
	studentId,
	pointId,
	name: pointId,
	score: value
});

const now = Date.parse('2026-10-26T00:00:00Z');

describe('bandOf', () => {
	it('needs work below half and is secure from four fifths', () => {
		expect(bandOf(0.49)).toBe('needs_work');
		expect(bandOf(0.5)).toBe('getting_there');
		expect(bandOf(0.79)).toBe('getting_there');
		expect(bandOf(0.8)).toBe('secure');
	});
});

describe('averagesOf', () => {
	it('takes the mean share of the stages a student practised, classroom by classroom', () => {
		const averages = averagesOf([
			{ classroomId: 'c1', studentId: 's1', stageId: 'a', marks: 4, total: 4 },
			{ classroomId: 'c1', studentId: 's1', stageId: 'b', marks: 1, total: 4 },
			{ classroomId: 'c2', studentId: 's1', stageId: 'a', marks: 0, total: 4 }
		]);
		expect(averages.get('c1:s1')).toBe(0.625);
		expect(averages.get('c2:s1')).toBe(0);
		expect(averages.has('c1:s2')).toBe(false);
	});
});

describe('pointsOf', () => {
	const five = ['a', 'b', 'c', 'd', 'e'].map((id) => enrolment('c1', id));

	it('leaves out a learning point answered by fewer than five students', () => {
		const scores = five.slice(0, 4).map((each) => score('c1', each.studentId, 'p', 1));
		expect(pointsOf(scores, five)).toEqual([]);
	});

	it('shows one answered by every student of a classroom smaller than five', () => {
		const three = five.slice(0, 3);
		const scores = three.map((each) => score('c1', each.studentId, 'p', 0.4));
		expect(pointsOf(scores, three)).toMatchObject([
			{ id: 'p', students: 3, band: 'needs_work', classroomIds: ['c1'] }
		]);
	});

	it('averages the students and lists the weakest first', () => {
		const scores: PointScore[] = [
			...five.map((each) => score('c1', each.studentId, 'strong', 0.9)),
			...five.map((each, at) => score('c1', each.studentId, 'weak', at === 0 ? 0.5 : 0))
		];
		const points = pointsOf(scores, five);
		expect(points.map((point) => point.id)).toEqual(['weak', 'strong']);
		expect(points[0].score).toBeCloseTo(0.1);
		expect(points[1].band).toBe('secure');
	});
});

describe('strugglingOf', () => {
	it('lists those below half, the lowest first, with their two weakest learning points', () => {
		const enrolments: Enrolment[] = [
			enrolment('c1', 'ana'),
			enrolment('c1', 'bo'),
			enrolment('c1', 'cy')
		];
		const averages = new Map([
			['c1:ana', 0.45],
			['c1:bo', 0.2],
			['c1:cy', 0.9]
		]);
		const scores = [
			score('c1', 'bo', 'p1', 0.3),
			score('c1', 'bo', 'p2', 0.1),
			score('c1', 'bo', 'p3', 0.4),
			score('c1', 'bo', 'p4', 0.7)
		];
		expect(strugglingOf(enrolments, averages, scores)).toEqual([
			{ ...enrolments[1], average: 0.2, weakest: ['p2', 'p1'] },
			{ ...enrolments[0], average: 0.45, weakest: [] }
		]);
	});
});

describe('starTallyOf', () => {
	it('counts each best result at its stars', () => {
		const best = (marks: number) => ({
			classroomId: 'c',
			studentId: 's',
			stageId: 'x',
			marks,
			total: 10
		});
		expect(starTallyOf([best(10), best(8), best(5), best(4), best(9)])).toEqual({
			stars: [1, 1, 2, 1],
			unpractised: 0
		});
	});
});

describe('progressOf', () => {
	it('counts only the assignments still in progress', () => {
		const given = [
			{ classroomId: 'c', dueAt: null, students: [{ doneAt: '2026-10-20T00:00:00Z' }] },
			{
				classroomId: 'c',
				dueAt: '2026-10-22T00:00:00Z',
				students: [
					{ doneAt: '2026-10-21T00:00:00Z' },
					{ doneAt: '2026-10-23T00:00:00Z' },
					{ doneAt: null }
				]
			},
			{ classroomId: 'c', dueAt: '2026-10-30T00:00:00Z', students: [{ doneAt: null }] }
		];
		expect(progressOf(given, now)).toEqual({ done: 1, late: 1, toDo: 1, overdue: 1 });
	});
});

describe('peopleOf', () => {
	it('counts a person in two classrooms once', () => {
		expect(
			peopleOf([
				enrolment('c1', 'ana', true),
				enrolment('c2', 'ana', false, true),
				enrolment('c1', 'bo')
			])
		).toEqual({ students: 2, thisWeek: 1, lastWeek: 1 });
	});
});

describe('classroomSummaryOf', () => {
	it('sums up one classroom from what was read of all of them', () => {
		const enrolments = [
			enrolment('c1', 'ana', true),
			enrolment('c1', 'bo'),
			enrolment('c2', 'cy', true)
		];
		const averages = new Map([
			['c1:ana', 0.9],
			['c1:bo', 0.3],
			['c2:cy', 0.1]
		]);
		const scores = [score('c1', 'ana', 'p', 1), score('c1', 'bo', 'p', 0.8)];
		const struggling = strugglingOf(enrolments, averages, scores);
		expect(
			classroomSummaryOf('c1', { enrolments, averages, scores, given: [], struggling }, now)
		).toEqual({
			students: 2,
			thisWeek: 1,
			average: 0.6,
			secure: 1,
			points: 1,
			progress: { done: 0, late: 0, toDo: 0, overdue: 0 },
			struggling: 1
		});
	});
});
