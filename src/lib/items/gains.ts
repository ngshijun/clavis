import { startOfDay } from '#lib/dates.js';
import { bestOf, starsOf } from './stars.js';

/**
 * What a student has gained by practising, as their home says it: the stars
 * they hold, the ones that are new since a moment, and the days in a row they
 * have practised. Like the stars, none of it is stored.
 */

interface Session {
	marks: number;
	total: number;
	completedAt: string;
}

/** The new stars a student is asked to earn in a day. */
export const DAILY_STAR_GOAL = 9;

/**
 * The stars held over some stages, by the stage's id: on each, those of the
 * best of its sessions finished before a moment, or of them all.
 */
export function starsHeld(attempts: Record<string, Session[]>, before = Infinity): number {
	return Object.values(attempts).reduce((sum, sessions) => {
		const best = bestOf(sessions.filter((each) => Date.parse(each.completedAt) < before));
		return sum + (best ? starsOf(best.marks, best.total) : 0);
	}, 0);
}

/** The stars that are new since a moment: a stage's star counts once, when it was first earned. */
export function starsSince(attempts: Record<string, Session[]>, since: number): number {
	return starsHeld(attempts) - starsHeld(attempts, since);
}

/**
 * The days in a row on which something was finished, up to today. A day not
 * yet practised on does not end the run: it ends once that day is over.
 */
export function streakOf(finished: string[], now: Date): number {
	const days = new Set(finished.map((moment) => startOfDay(new Date(moment))));
	let back = days.has(startOfDay(now)) ? 0 : -1;
	let streak = 0;
	while (days.has(startOfDay(now, back))) {
		streak += 1;
		back -= 1;
	}
	return streak;
}
