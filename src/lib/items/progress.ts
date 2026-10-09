import { bestOf, starsOf, type Stars } from './stars.js';

/**
 * What the practice sessions on record in a classroom come to, for whoever
 * follows them: a student on one stage, the class on one stage, and a
 * student over every stage. Like the stars, none of it is stored.
 */

interface Session {
	marks: number;
	total: number;
	completedAt: string;
}

/** Where a student stands on a stage they have practised. */
export interface Standing<Finished extends Session = Session> {
	/** Their best session of it. */
	best: Finished;
	/** The stars that session earned. */
	stars: Stars;
	/** How many times they have finished it. */
	attempts: number;
	/** When they last finished it. */
	last: string;
}

/**
 * Where a student stands on a stage, from their finished sessions of it, the
 * latest first. Undefined when they have not practised it.
 */
export function standingOf<Finished extends Session>(
	sessions: Finished[]
): Standing<Finished> | undefined {
	const best = bestOf(sessions);
	if (!best) return undefined;

	return {
		best,
		stars: starsOf(best.marks, best.total),
		attempts: sessions.length,
		last: sessions[0].completedAt
	};
}

/** How a class stands on a stage. */
export interface Tally {
	/** How many students' best earns each number of stars, from none to three. */
	stars: [number, number, number, number];
	/** How many have not practised it. */
	unpractised: number;
}

/** How a class stands on a stage, from where each of its students stands on it. */
export function tallyOf(standings: (Standing | undefined)[]): Tally {
	const tally: Tally = { stars: [0, 0, 0, 0], unpractised: 0 };
	for (const standing of standings) {
		if (standing) tally.stars[standing.stars] += 1;
		else tally.unpractised += 1;
	}
	return tally;
}

/** What a student has done over the stages of a classroom. */
export interface Summary {
	/** How many of the stages they have practised. */
	stages: number;
	/** The stars they hold over those stages. */
	stars: number;
	/** How many sessions they have finished. */
	sessions: number;
	/** When they last finished one; undefined when they have finished none. */
	last: string | undefined;
}

/** What a student has done, from where they stand on each stage. */
export function summaryOf(standings: (Standing | undefined)[]): Summary {
	const practised = standings.filter((standing) => standing !== undefined);
	return {
		stages: practised.length,
		stars: practised.reduce((sum, standing) => sum + standing.stars, 0),
		sessions: practised.reduce((sum, standing) => sum + standing.attempts, 0),
		// Moments are written the same way throughout, so the latest is the last in order.
		last: practised
			.map((standing) => standing.last)
			.sort()
			.at(-1)
	};
}
