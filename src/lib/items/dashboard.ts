import { isLate } from './assignments.js';
import type { Tally } from './progress.js';
import { starsOf } from './stars.js';

/**
 * What a teacher's dashboard works out from what the database hands it about
 * their classrooms. Like the stars, none of it is stored. A student in two of
 * the classrooms counts in each, since progress belongs to the classroom; a
 * count of people counts them once.
 */

/** A student of one of the classrooms, and whether they practised there lately. */
export interface Enrolment {
	classroomId: string;
	studentId: string;
	name: string;
	/** Whether they finished a practice in the last seven days. */
	thisWeek: boolean;
	/** Whether they finished one in the seven days before. */
	lastWeek: boolean;
}

/** A student's best session on a stage, in one classroom. */
export interface StageBest {
	classroomId: string;
	studentId: string;
	stageId: string;
	marks: number;
	total: number;
}

/** How a student does on a learning point, in one classroom: the share of the marks of the questions that count. */
export interface PointScore {
	classroomId: string;
	studentId: string;
	pointId: string;
	name: string;
	score: number;
}

/** An assignment, as far as the dashboard reads it. */
export interface Given {
	classroomId: string;
	dueAt: string | null;
	students: { doneAt: string | null }[];
}

/**
 * Below half a learning point needs work, and from four fifths it is secure:
 * the shares a star takes, so a teacher reads one scale throughout.
 */
export type Band = 'needs_work' | 'getting_there' | 'secure';

export function bandOf(score: number): Band {
	if (score < 1 / 2) return 'needs_work';
	return score < 4 / 5 ? 'getting_there' : 'secure';
}

/** A learning point is shown once this many students have answered it, or every student there is when there are fewer. */
export const ENOUGH_STUDENTS = 5;

const key = (classroomId: string, studentId: string) => `${classroomId}:${studentId}`;

const mean = (values: number[]) =>
	values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Each student's average score in a classroom: the mean of their best share
 * of the marks over the stages they have practised there, by
 * `classroomId:studentId`. A student who has practised nothing is not in it.
 */
export function averagesOf(bests: StageBest[]): Map<string, number> {
	const shares = new Map<string, number[]>();
	for (const best of bests) {
		const id = key(best.classroomId, best.studentId);
		shares.set(id, [...(shares.get(id) ?? []), best.marks / best.total]);
	}
	return new Map([...shares].map(([id, values]) => [id, mean(values) as number]));
}

/** How the students stand on a learning point. */
export interface Point {
	id: string;
	name: string;
	/** The mean of the students' scores on it. */
	score: number;
	band: Band;
	/** How many students have answered it. */
	students: number;
	/** The classrooms it was answered in. */
	classroomIds: string[];
}

/**
 * The learning points the students have answered enough of to say how they
 * stand, the weakest first. One answered by too few students is left out
 * (`ENOUGH_STUDENTS`), counted against the students of the classrooms it was
 * answered in.
 */
export function pointsOf(scores: PointScore[], enrolments: Enrolment[]): Point[] {
	const enrolled = new Map<string, number>();
	for (const enrolment of enrolments) {
		enrolled.set(enrolment.classroomId, (enrolled.get(enrolment.classroomId) ?? 0) + 1);
	}

	const byPoint = new Map<string, PointScore[]>();
	for (const score of scores)
		byPoint.set(score.pointId, [...(byPoint.get(score.pointId) ?? []), score]);

	const points: Point[] = [];
	for (const [id, rows] of byPoint) {
		const classroomIds = [...new Set(rows.map((row) => row.classroomId))];
		const students = classroomIds.reduce((sum, each) => sum + (enrolled.get(each) ?? 0), 0);
		if (rows.length < Math.min(ENOUGH_STUDENTS, students)) continue;

		const score = mean(rows.map((row) => row.score)) as number;
		points.push({
			id,
			name: rows[0].name,
			score,
			band: bandOf(score),
			students: rows.length,
			classroomIds
		});
	}
	return points.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
}

/** How many learning points are in each band. */
export function bandsOf(points: Point[]): Record<Band, number> {
	const bands = { needs_work: 0, getting_there: 0, secure: 0 };
	for (const point of points) bands[point.band] += 1;
	return bands;
}

/** A student whose average is below half, with the learning points they find hardest. */
export interface Struggling {
	classroomId: string;
	studentId: string;
	name: string;
	average: number;
	/** Up to two learning points they need work on, the weakest first. */
	weakest: string[];
}

/** The students whose average score is below half, the lowest first. */
export function strugglingOf(
	enrolments: Enrolment[],
	averages: Map<string, number>,
	scores: PointScore[]
): Struggling[] {
	return enrolments
		.flatMap((enrolment) => {
			const average = averages.get(key(enrolment.classroomId, enrolment.studentId));
			if (average === undefined || average >= 1 / 2) return [];

			const weakest = scores
				.filter(
					(score) =>
						score.classroomId === enrolment.classroomId &&
						score.studentId === enrolment.studentId &&
						bandOf(score.score) === 'needs_work'
				)
				.sort((a, b) => a.score - b.score)
				.slice(0, 2)
				.map((score) => score.name);
			return [{ ...enrolment, average, weakest }];
		})
		.sort((a, b) => a.average - b.average);
}

/** How every best result on a stage spreads across the stars. Nobody is unpractised: only what was practised is counted. */
export function starTallyOf(bests: StageBest[]): Tally {
	const tally: Tally = { stars: [0, 0, 0, 0], unpractised: 0 };
	for (const best of bests) tally.stars[starsOf(best.marks, best.total)] += 1;
	return tally;
}

/** Where the students given the assignments still in progress stand on them. */
export interface Progress {
	done: number;
	late: number;
	toDo: number;
	overdue: number;
}

/**
 * Where everyone stands on the assignments still in progress: those someone
 * given them has yet to do. One everybody has done is over and not counted.
 */
export function progressOf(given: Given[], now: number): Progress {
	const progress = { done: 0, late: 0, toDo: 0, overdue: 0 };
	for (const assignment of given) {
		if (assignment.students.every((student) => student.doneAt)) continue;

		const due = assignment.dueAt ? Date.parse(assignment.dueAt) : undefined;
		for (const { doneAt } of assignment.students) {
			if (doneAt) progress[isLate(doneAt, assignment.dueAt) ? 'late' : 'done'] += 1;
			else progress[due !== undefined && due < now ? 'overdue' : 'toDo'] += 1;
		}
	}
	return progress;
}

/** How one classroom is doing. */
export interface ClassroomSummary {
	students: number;
	/** How many of them practised there in the last seven days. */
	thisWeek: number;
	/** The mean of its students' averages; undefined when none has practised. */
	average: number | undefined;
	/** Its learning points that are secure, of those that can be told. */
	secure: number;
	points: number;
	progress: Progress;
	struggling: number;
}

/** How one classroom is doing, from what was read of every classroom. */
export function classroomSummaryOf(
	classroomId: string,
	read: {
		enrolments: Enrolment[];
		averages: Map<string, number>;
		scores: PointScore[];
		given: Given[];
		struggling: Struggling[];
	},
	now: number
): ClassroomSummary {
	const enrolments = read.enrolments.filter((each) => each.classroomId === classroomId);
	const points = pointsOf(
		read.scores.filter((each) => each.classroomId === classroomId),
		enrolments
	);
	return {
		students: enrolments.length,
		thisWeek: enrolments.filter((each) => each.thisWeek).length,
		average: mean(
			enrolments.flatMap((each) => read.averages.get(key(classroomId, each.studentId)) ?? [])
		),
		secure: points.filter((point) => point.band === 'secure').length,
		points: points.length,
		progress: progressOf(
			read.given.filter((each) => each.classroomId === classroomId),
			now
		),
		struggling: read.struggling.filter((each) => each.classroomId === classroomId).length
	};
}

/** How many people there are, and how many of them practised this week and the week before: a person in two classrooms once. */
export function peopleOf(enrolments: Enrolment[]): {
	students: number;
	thisWeek: number;
	lastWeek: number;
} {
	const people = new Map<string, { thisWeek: boolean; lastWeek: boolean }>();
	for (const each of enrolments) {
		const person = people.get(each.studentId) ?? { thisWeek: false, lastWeek: false };
		people.set(each.studentId, {
			thisWeek: person.thisWeek || each.thisWeek,
			lastWeek: person.lastWeek || each.lastWeek
		});
	}
	const all = [...people.values()];
	return {
		students: all.length,
		thisWeek: all.filter((person) => person.thisWeek).length,
		lastWeek: all.filter((person) => person.lastWeek).length
	};
}
