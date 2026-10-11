/**
 * What an assignment's pages work out from its moments: which practice
 * counts towards it, whether it was done late, and which of several is the
 * most pressing. Moments are compared as moments, never as text.
 */

/**
 * The sessions finished since something was assigned. Only those count
 * towards it: practice done before was not done for the assignment.
 */
export function sinceAssigned<Session extends { completedAt: string }>(
	sessions: Session[],
	assignedAt: string
): Session[] {
	const from = Date.parse(assignedAt);
	return sessions.filter((session) => Date.parse(session.completedAt) >= from);
}

/** Whether something done at one moment was done after it was due. With no due date nothing is late. */
export function isLate(doneAt: string, dueAt: string | null): boolean {
	return dueAt !== null && Date.parse(doneAt) > Date.parse(dueAt);
}

/**
 * The order work still to do is listed in, the most pressing first: by due
 * date, the soonest first, which puts what is overdue at the top; then what
 * has no due date, the longest assigned first.
 */
export function byDue(
	a: { dueAt: string | null; assignedAt: string },
	b: { dueAt: string | null; assignedAt: string }
): number {
	if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
	if (a.dueAt || b.dueAt) return a.dueAt ? -1 : 1;
	return Date.parse(a.assignedAt) - Date.parse(b.assignedAt);
}
