import { byDue } from './assignments.js';

/**
 * What a page lists of the work in a classroom: what was assigned there and
 * the practice finished there, each beside the stage it is of. A stage that
 * has since lost its every question cannot be practised, and is on no path;
 * what is of such a stage is not listed either.
 */

/** Assignments beside the stage each is of, by the stage's id, in the order given. */
export function workOf<Assigned extends { stageId: string }, Stop>(
	assignments: Assigned[],
	stops: Record<string, Stop>
): { assignment: Assigned; stop: Stop }[] {
	return assignments.flatMap((assignment) => {
		const stop = stops[assignment.stageId];
		return stop ? [{ assignment, stop }] : [];
	});
}

/** What a student has yet to do of their work, the most pressing first. */
export function toDoOf<
	Work extends { assignment: { doneAt: string | null; dueAt: string | null; assignedAt: string } }
>(work: Work[]): Work[] {
	return work
		.filter((each) => !each.assignment.doneAt)
		.sort((a, b) => byDue(a.assignment, b.assignment));
}

/** The order finished sessions are listed in: the latest first. */
function byLatest(
	a: { attempt: { completedAt: string } },
	b: { attempt: { completedAt: string } }
): number {
	return Date.parse(b.attempt.completedAt) - Date.parse(a.attempt.completedAt);
}

/** Every finished session of some stages, by the stage's id, beside its stage: the latest first. */
export function sessionsOf<Attempt extends { completedAt: string }, Stop>(
	attempts: Record<string, Attempt[]>,
	stops: Record<string, Stop>
): { attempt: Attempt; stop: Stop }[] {
	return Object.entries(attempts)
		.flatMap(([stageId, sessions]) => {
			const stop = stops[stageId];
			return stop ? sessions.map((attempt) => ({ attempt, stop })) : [];
		})
		.sort(byLatest);
}
