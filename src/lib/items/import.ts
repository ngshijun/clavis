import * as z from 'zod';
import { imagePaths } from '#lib/item-images.js';
import { m } from '#lib/paraglide/messages.js';
import { passageKey, validatePassage } from '#lib/passage.js';
import { MAX_ENTRY_CHARS } from './limits.js';
import { DIFFICULTIES, type Difficulty, type ItemPayload } from './payload.js';
import { contentKey } from './same.js';
import { validateItem } from './schema.js';

/**
 * An import, between the workbook and the database. The rows read off a
 * workbook are candidates; a plan says what importing them into one stage
 * would add. The review shows a plan, and the import makes its own plan from
 * the candidates the page posts back, so nothing the page says is taken on
 * trust: not an id, not a count.
 */

/** The largest workbook that is read. */
export const MAX_WORKBOOK_BYTES = 2 * 1024 * 1024;
/** The most question rows one workbook may hold. */
export const MAX_IMPORT_QUESTIONS = 500;

/**
 * Why a file is not read at all, or null for one that may be. The page asks
 * before it uploads, so a large file is refused in these words rather than by
 * the host's own limit; the server asks again.
 */
export function fileRefusal(file: { name: string; size: number }): string | null {
	if (!file.name.toLowerCase().endsWith('.xlsx')) return m.practice_import_not_xlsx();
	if (file.size > MAX_WORKBOOK_BYTES) return m.practice_import_too_large();
	return null;
}

/** A passage of a workbook, known to its questions by the code its row gives it. */
export interface CandidatePassage {
	code: string;
	title: string;
	body: string;
}

/** A question of a workbook, complete and tidied. */
export interface CandidateQuestion {
	payload: ItemPayload;
	difficulty: Difficulty;
	/** The code of the passage it joins; null for one that stands alone. */
	passage: string | null;
}

export interface Candidates {
	passages: CandidatePassage[];
	/** In the order they join the stage: sheet by sheet, row by row. */
	questions: CandidateQuestion[];
}

/** A row of a workbook that is left out until it is put right. */
export interface ImportProblem {
	/** The name of the sheet, as on its tab. */
	sheet: string;
	/** The number the spreadsheet shows beside the row. */
	row: number;
	/** What to put right, in the reader's language. */
	reason: string;
}

/** What the page is shown before anything is written. */
export interface ImportReview {
	/** The rows that are ready. The page posts them back, as they are, to import them. */
	rows: Candidates;
	/** How many passages the import makes. */
	passages: number;
	/** How many rows are left out because the stage already asks the same. */
	duplicates: number;
	problems: ImportProblem[];
}

/** A passage code as it is compared: a teacher writes `P1` in one sheet and `p1` in another. */
export function passageCode(written: string): string {
	return written.trim().toLowerCase();
}

/** What a stage holds already, as far as an import looks at it. */
export interface Stored {
	questions: ItemPayload[];
	passages: { id: string; title: string; body: string }[];
}

/** Where a planned question goes: under a passage the import makes, under a stored one, or on its own. */
export type PlannedPlace = { created: number } | { stored: string } | null;

export interface ImportPlan {
	/** The passages to make, in the order they join the stage. */
	passages: { title: string; body: string }[];
	/** The questions to add. `created` is a place in `passages`, `stored` a passage's id. */
	questions: { payload: ItemPayload; difficulty: Difficulty; place: PlannedPlace }[];
	/** How many candidates are left out because the stage, or an earlier row, asks the same. */
	duplicates: number;
	/** The candidates the plan is made of, as they were given, to be posted back for the import. */
	kept: Candidates;
}

/**
 * What importing `candidates` into a stage adds. A question the stage already
 * holds is left out, and so is the repeat of an earlier row. A passage is made
 * only if a question that is added joins it, and a passage that reads the same
 * as a stored one is not made again: its questions go under the stored one,
 * which is what lets a file be fixed and imported a second time.
 */
export function planImport(candidates: Candidates, stored: Stored): ImportPlan {
	const seen = new Set(stored.questions.map(contentKey));
	const fresh = candidates.questions.filter((question) => {
		const key = contentKey(question.payload);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const joined = candidates.passages.filter((passage) =>
		fresh.some((question) => question.passage === passage.code)
	);
	const passages: ImportPlan['passages'] = [];
	const places = new Map<string, PlannedPlace>();
	for (const passage of joined) {
		const key = passageKey(passage);
		const match = stored.passages.find((each) => passageKey(each) === key);
		if (match) {
			places.set(passage.code, { stored: match.id });
		} else {
			places.set(passage.code, { created: passages.length });
			passages.push({ title: passage.title, body: passage.body });
		}
	}

	return {
		passages,
		questions: fresh.map(({ payload, difficulty, passage }) => {
			const place = passage === null ? null : places.get(passage);
			if (place === undefined) throw new Error(`No passage of the import has the code ${passage}`);
			return { payload, difficulty, place };
		}),
		duplicates: candidates.questions.length - fresh.length,
		kept: { passages: joined, questions: fresh }
	};
}

const postedSchema = z.object({
	passages: z
		.array(z.object({ code: z.string().max(MAX_ENTRY_CHARS), title: z.string(), body: z.string() }))
		.max(MAX_IMPORT_QUESTIONS),
	questions: z
		.array(
			z.object({
				payload: z.unknown(),
				difficulty: z.enum(DIFFICULTIES),
				passage: z.string().max(MAX_ENTRY_CHARS).nullable()
			})
		)
		.max(MAX_IMPORT_QUESTIONS)
});

/**
 * The candidates a page posted back, checked as if they had never been seen:
 * every question and passage is complete and names no picture, no two
 * passages share a code and every question's passage is among them. Null for anything else, which a
 * review of ours cannot have produced.
 */
export function checkCandidates(posted: unknown): Candidates | null {
	const parsed = postedSchema.safeParse(posted);
	if (!parsed.success) return null;

	const passages: CandidatePassage[] = [];
	for (const passage of parsed.data.passages) {
		const checked = validatePassage({ title: passage.title, body: passage.body });
		const code = passageCode(passage.code);
		// A sheet carries no picture, so a passage of an import is its text.
		if (!checked.ok || checked.content.body === '' || code === '') return null;
		if (passages.some((each) => each.code === code)) return null;
		passages.push({ code, title: checked.content.title, body: checked.content.body });
	}

	const questions: CandidateQuestion[] = [];
	for (const question of parsed.data.questions) {
		const checked = validateItem(question.payload);
		const passage = question.passage === null ? null : passageCode(question.passage);
		// A workbook carries no pictures, so a question that names one names another row's.
		if (!checked.ok || imagePaths(checked.payload).length > 0) return null;
		if (passage !== null && !passages.some((each) => each.code === passage)) return null;
		questions.push({ payload: checked.payload, difficulty: question.difficulty, passage });
	}
	return { passages, questions };
}
