/**
 * The stars a practice session earns, from none to three, by the share of
 * the stage's marks it scored. Nothing of them is stored: wherever stars are
 * shown they are worked out from a session's score, so a session done before
 * there were stars has them too.
 */

export type Stars = 0 | 1 | 2 | 3;

/**
 * The marks each star takes on a stage of `total` marks: half of them, four
 * fifths of them, and all of them. They are whole marks, a share that falls
 * between two being rounded up, so that a pupil can be told them and a score
 * either reaches one or does not.
 *
 * On a stage of a few questions the rounding would ask the same marks for
 * two stars as for three, so each star is kept a mark below the next: three
 * stars are always every mark and nothing less. Only a stage of one or two
 * questions is too short for three different targets.
 */
export function starTargets(total: number): [number, number, number] {
	const two = Math.max(1, Math.min(Math.ceil((total * 4) / 5), total - 1));
	const one = Math.max(1, Math.min(Math.ceil(total / 2), two - 1));
	return [one, two, total];
}

export function starsOf(marks: number, total: number): Stars {
	return starTargets(total).filter((target) => marks >= target).length as Stars;
}

/**
 * The best of some sessions: the one that scored the largest share of its
 * marks and, of those that tie, the first in the list. Undefined for none.
 * The share is what counts because a stage may have gained or lost a
 * question between two sessions.
 */
export function bestOf<Session extends { marks: number; total: number }>(
	sessions: Session[]
): Session | undefined {
	const share = (session: Session) => session.marks / session.total;
	return sessions.reduce<Session | undefined>(
		(best, session) => (best && share(best) >= share(session) ? best : session),
		undefined
	);
}
