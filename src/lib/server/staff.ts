import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.js';
import { sinceAssigned } from '#lib/items/assignments.js';
import { bestOf } from '#lib/items/stars.js';
import { studentPath, type StaffRole } from '#lib/navigation.js';
import { resolvePath } from '#lib/paths.js';
import { getAssignment, listAssignments } from './assignments.js';
import { getClassroomStudent, listClassroomStudents } from './classrooms.js';
import { classroomPractice, questionImageBase, reviewPracticeSession, standingsOf } from './run.js';

type Supabase = SupabaseClient<Database>;

/**
 * What the pages of a classroom read for its staff: a teacher of it, and a
 * manager of its organization, who is shown what the teacher is and assigns
 * nothing. The database hands both the same rows, so each page's load is
 * one function here, called from the page under either role.
 */

/**
 * A classroom's practice as its staff follow it: the stages, the students,
 * and where each student stands on each stage.
 */
export async function readClass(supabase: Supabase, classroomId: string) {
	const [practice, students] = await Promise.all([
		classroomPractice(supabase, classroomId),
		listClassroomStudents(supabase, classroomId)
	]);
	return { topics: practice.topics, standings: standingsOf(practice.attempts), students };
}

/**
 * What has been assigned in a classroom, with what assigning more takes: the
 * stages it can be about, the students, and where each stands on each stage.
 */
export async function readOverview(supabase: Supabase, classroomId: string) {
	const [read, assignments] = await Promise.all([
		readClass(supabase, classroomId),
		listAssignments(supabase, [classroomId])
	]);
	return { ...read, assignments };
}

/** One student of a classroom, with their practice there. */
export async function readStudent(supabase: Supabase, classroomId: string, studentId: string) {
	const [student, practice] = await Promise.all([
		getClassroomStudent(supabase, classroomId, studentId),
		classroomPractice(supabase, classroomId)
	]);
	if (!student) error(404, 'Student not found');

	return {
		student,
		topics: practice.topics,
		attempts: practice.attempts[student.id] ?? {},
		title: student.name
	};
}

/**
 * One assignment of a classroom: every student it was given to, with when
 * they did it and the best they have scored on its stage since it was
 * assigned. Practice from before it was assigned does not count towards it.
 */
export async function readAssignment(
	supabase: Supabase,
	classroomId: string,
	assignmentId: string
) {
	const [assignment, practice, students] = await Promise.all([
		getAssignment(supabase, classroomId, assignmentId),
		classroomPractice(supabase, classroomId),
		listClassroomStudents(supabase, classroomId)
	]);
	if (!assignment) error(404, 'Assignment not found');

	const topic = practice.topics.find((each) =>
		each.stages.some((stage) => stage.id === assignment.stageId)
	);
	const stage = topic?.stages.find((each) => each.id === assignment.stageId);
	if (!topic || !stage) error(404, 'Assignment not found');

	const given = new Map(assignment.students.map((student) => [student.studentId, student.doneAt]));
	// In the roster's order, which is by name: those who have done it, then those who have yet to.
	const rows = students
		.filter((student) => given.has(student.id))
		.map((student) => ({
			id: student.id,
			name: student.name,
			doneAt: given.get(student.id) ?? null,
			best:
				bestOf(
					sinceAssigned(practice.attempts[student.id]?.[stage.id] ?? [], assignment.assignedAt)
				) ?? null
		}))
		.sort((a, b) => Number(b.doneAt !== null) - Number(a.doneAt !== null));

	return {
		assignment: {
			assignedAt: assignment.assignedAt,
			assignedBy: assignment.assignedBy,
			dueAt: assignment.dueAt
		},
		stage,
		topic: { name: topic.name },
		rows,
		title: stage.name
	};
}

/**
 * One finished practice session of a student of the classroom, as the
 * student was shown it marked. The database hands a session to its
 * classroom's staff; the address has to name the classroom and the student
 * it is of as well.
 */
export async function readSession(
	supabase: Supabase,
	role: StaffRole,
	named: { classroomId: string; studentId: string; sessionId: string }
) {
	const [student, review] = await Promise.all([
		getClassroomStudent(supabase, named.classroomId, named.studentId),
		reviewPracticeSession(supabase, named.sessionId)
	]);
	if (
		!student ||
		!review ||
		review.classroomId !== named.classroomId ||
		review.studentId !== student.id
	) {
		error(404, 'Practice session not found');
	}

	const back = resolvePath(studentPath(role, named.classroomId, student.id));
	return {
		student,
		review,
		imageBase: questionImageBase(supabase),
		back,
		trail: [{ label: student.name, href: back }],
		title: review.run.stage.name,
		// The run's frame holds itself to the width a question reads well at.
		wide: true
	};
}

export type ClassRead = Awaited<ReturnType<typeof readClass>>;
export type OverviewRead = Awaited<ReturnType<typeof readOverview>>;
export type StudentRead = Awaited<ReturnType<typeof readStudent>>;
export type AssignmentRead = Awaited<ReturnType<typeof readAssignment>>;
export type SessionRead = Awaited<ReturnType<typeof readSession>>;
