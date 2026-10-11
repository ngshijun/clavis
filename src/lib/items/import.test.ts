import { describe, expect, it } from 'vitest';
import { m } from '#lib/paraglide/messages.js';
import {
	checkCandidates,
	fileRefusal,
	MAX_IMPORT_QUESTIONS,
	MAX_PICKED_BYTES,
	MAX_WORKBOOK_BYTES,
	pickedRefusal,
	planImport,
	type CandidateQuestion,
	type Stored
} from './import.js';
import type { ShortAnswerPayload } from './payload.js';

const short = (question: string): ShortAnswerPayload => ({
	type: 'short_answer',
	question,
	accepted_answers: ['yes']
});

const candidate = (question: string, passage: string | null = null): CandidateQuestion => ({
	payload: short(question),
	difficulty: 'medium',
	passage
});

const empty: Stored = { questions: [], passages: [] };
const rain = { code: 'p1', title: 'Rain', body: 'It rains.', image_path: null };

describe('fileRefusal', () => {
	it('takes a workbook of up to two megabytes', () => {
		expect(fileRefusal({ name: 'Plants.XLSX', size: MAX_WORKBOOK_BYTES })).toBeNull();
	});

	it('refuses any other kind of file, and one that is too large, each in its own words', () => {
		expect(fileRefusal({ name: 'plants.xls', size: 10 })).toBe(m.practice_import_not_xlsx());
		expect(fileRefusal({ name: 'plants.csv', size: 10 })).toBe(m.practice_import_not_xlsx());
		expect(fileRefusal({ name: 'plants.xlsx', size: MAX_WORKBOOK_BYTES + 1 })).toBe(
			m.practice_import_too_large()
		);
	});
});

describe('pickedRefusal', () => {
	it('takes a file far larger than a workbook may be without its pictures', () => {
		expect(pickedRefusal({ name: 'Plants.xlsx', size: MAX_PICKED_BYTES })).toBeNull();
	});

	it('refuses any other kind of file, and one that is too large, each in its own words', () => {
		expect(pickedRefusal({ name: 'plants.xls', size: 10 })).toBe(m.practice_import_not_xlsx());
		expect(pickedRefusal({ name: 'plants.xlsx', size: MAX_PICKED_BYTES + 1 })).toBe(
			m.practice_import_file_too_large()
		);
	});
});

describe('planImport', () => {
	it('adds every question to an empty stage, each on its own', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('One?'), candidate('Two?')] },
			empty
		);
		expect(plan).toMatchObject({ passages: [], duplicates: 0 });
		expect(plan.questions.map((each) => [each.payload.question, each.place])).toEqual([
			['One?', null],
			['Two?', null]
		]);
	});

	it('leaves out a question the stage already asks, whatever its capitals', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('ONE? '), candidate('Two?')] },
			{ questions: [short('One?')], passages: [] }
		);
		expect(plan.duplicates).toBe(1);
		expect(plan.questions.map((each) => each.payload.question)).toEqual(['Two?']);
		expect(plan.kept.questions.map((each) => each.payload.question)).toEqual(['Two?']);
	});

	it('leaves out the repeat of an earlier row', () => {
		const plan = planImport(
			{ passages: [], questions: [candidate('One?'), candidate('One?'), candidate('one?')] },
			empty
		);
		expect(plan.duplicates).toBe(2);
		expect(plan.questions).toHaveLength(1);
	});

	it('makes the passages its questions join, and puts each question under its own', () => {
		const snow = { code: 'p2', title: 'Snow', body: 'It snows.', image_path: null };
		const plan = planImport(
			{
				passages: [rain, snow],
				questions: [candidate('Snow one?', 'p2'), candidate('Alone?'), candidate('Rain one?', 'p1')]
			},
			empty
		);
		expect(plan.passages).toEqual([
			{ title: 'Rain', body: 'It rains.', image_path: null },
			{ title: 'Snow', body: 'It snows.', image_path: null }
		]);
		expect(plan.questions.map((each) => each.place)).toEqual([
			{ created: 1 },
			null,
			{ created: 0 }
		]);
	});

	it('makes no passage that no added question joins', () => {
		const plan = planImport(
			{ passages: [rain], questions: [candidate('On it?', 'p1'), candidate('Alone?')] },
			{ questions: [short('On it?')], passages: [] }
		);
		expect(plan.passages).toEqual([]);
		expect(plan.kept.passages).toEqual([]);
		expect(plan.questions.map((each) => each.place)).toEqual([null]);
	});

	it('puts a question under the stored passage that reads the same, and makes no second one', () => {
		const plan = planImport(
			{ passages: [rain], questions: [candidate('Old?', 'p1'), candidate('New?', 'p1')] },
			{
				questions: [short('Old?')],
				passages: [{ id: 'stored-rain', title: ' rain', body: 'IT RAINS.', image_path: null }]
			}
		);
		expect(plan.passages).toEqual([]);
		expect(plan.duplicates).toBe(1);
		expect(plan.questions).toEqual([
			{ payload: short('New?'), difficulty: 'medium', place: { stored: 'stored-rain' } }
		]);
		// The passage goes back with its question, so the import can find the stored one again.
		expect(plan.kept).toEqual({ passages: [rain], questions: [candidate('New?', 'p1')] });
	});

	it('tells two questions apart by their pictures, and knows a picture that is stored already', () => {
		const mark = (letter: string) => letter.repeat(32);
		const pictured = (picture: string): CandidateQuestion => ({
			...candidate('Which shape is this?'),
			payload: { ...short('Which shape is this?'), image_path: picture }
		});
		const rows = {
			passages: [{ ...rain, image_path: `upload:${mark('c')}` }],
			questions: [
				pictured(`upload:${mark('a')}`),
				pictured(`upload:${mark('b')}`),
				pictured(`upload:${mark('a')}`),
				candidate('On it?', 'p1')
			]
		};
		const first = planImport(rows, empty);
		expect(first.duplicates).toBe(1);
		expect(first.questions.map((each) => each.payload.image_path)).toEqual([
			`upload:${mark('a')}`,
			`upload:${mark('b')}`,
			undefined
		]);
		expect(first.passages).toEqual([
			{ title: 'Rain', body: 'It rains.', image_path: `upload:${mark('c')}` }
		]);

		// The same file again, once its pictures are stored under names that carry their fingerprints.
		const stored: Stored = {
			questions: [
				{ ...short('Which shape is this?'), image_path: `stages/s/${mark('a')}-1.webp` },
				short('On it?')
			],
			passages: [
				{ id: 'made', title: 'Rain', body: 'It rains.', image_path: `stages/s/${mark('c')}-2.webp` }
			]
		};
		const second = planImport(rows, stored);
		expect(second.questions.map((each) => each.payload.image_path)).toEqual([
			`upload:${mark('b')}`
		]);
		expect(second.passages).toEqual([]);
	});

	it('adds nothing the second time the same rows are planned', () => {
		const candidates = {
			passages: [rain],
			questions: [candidate('One?', 'p1'), candidate('Two?')]
		};
		const first = planImport(candidates, empty);
		const second = planImport(first.kept, {
			questions: first.questions.map((each) => each.payload),
			passages: [{ id: 'made', ...first.passages[0] }]
		});
		expect(second).toMatchObject({ passages: [], questions: [], duplicates: 2 });
	});

	it('refuses to plan a question whose passage is not among the candidates', () => {
		expect(() =>
			planImport({ passages: [], questions: [candidate('Lost?', 'p9')] }, empty)
		).toThrow('p9');
	});
});

describe('checkCandidates', () => {
	const posted = (question: unknown, passages: unknown[] = []) => ({
		passages,
		questions: [question]
	});
	/** Checked for a stage where the pictures in `free` are stored and no row names them. */
	const check = (rows: unknown, free: string[] = []) =>
		checkCandidates(rows, (path) => free.includes(path));

	it('takes back what a review handed out, tidied again', () => {
		const candidates = {
			passages: [{ code: ' P1 ', title: ' Rain ', body: 'It rains.', image_path: null }],
			questions: [
				{ payload: { ...short(' One? '), stray: true }, difficulty: 'high', passage: 'P1' }
			]
		};
		expect(check(candidates)).toEqual({
			passages: [rain],
			questions: [{ payload: short('One?'), difficulty: 'high', passage: 'p1' }]
		});
		expect(check(JSON.parse(JSON.stringify(candidates)))).not.toBeNull();
	});

	it('refuses a question that is not complete', () => {
		expect(check(posted(candidate('')))).toBeNull();
		expect(check(posted({ ...candidate('One?'), payload: { type: 'short_answer' } }))).toBeNull();
		expect(check(posted({ ...candidate('One?'), difficulty: 'hard' }))).toBeNull();
	});

	it('takes a question and a passage whose pictures are free to be theirs', () => {
		const pictured = { ...short('One?'), image_path: 'stages/s/one.png' };
		const rows = posted({ ...candidate('One?', 'p1'), payload: pictured }, [
			{ ...rain, body: '', image_path: 'stages/s/rain.png' }
		]);
		expect(check(rows, ['stages/s/one.png', 'stages/s/rain.png'])).toEqual({
			passages: [{ ...rain, body: '', image_path: 'stages/s/rain.png' }],
			questions: [{ payload: pictured, difficulty: 'medium', passage: 'p1' }]
		});
	});

	it('refuses a picture that is not free: another stage’s, a stored row’s, one not uploaded', () => {
		const pictured = (path: string) => ({
			...candidate('One?'),
			payload: { ...short('One?'), image_path: path }
		});
		expect(check(posted(pictured('stages/other/picture.png')), ['stages/s/one.png'])).toBeNull();
		expect(check(posted(pictured('upload:0123')), ['stages/s/one.png'])).toBeNull();
		expect(
			check(posted(candidate('One?', 'p1'), [{ ...rain, image_path: 'stages/s/taken.png' }]))
		).toBeNull();
	});

	it('refuses a picture that two rows name, since a stored picture is one row’s', () => {
		const pictured = (question: string) => ({
			...candidate(question),
			payload: { ...short(question), image_path: 'stages/s/one.png' }
		});
		const rows = { passages: [], questions: [pictured('One?'), pictured('Two?')] };
		expect(check(rows, ['stages/s/one.png'])).toBeNull();
		expect(check({ ...rows, questions: [pictured('One?')] }, ['stages/s/one.png'])).not.toBeNull();
	});

	it('refuses a passage code that names no passage, or two passages', () => {
		expect(check(posted(candidate('One?', 'p1')))).toBeNull();
		expect(check(posted(candidate('One?', 'p1'), [rain, { ...rain, code: 'P1' }]))).toBeNull();
		expect(check(posted(candidate('One?', 'p1'), [rain]))).not.toBeNull();
	});

	it('refuses a passage with no title, or with neither text nor picture', () => {
		expect(check(posted(candidate('One?'), [{ ...rain, title: ' ' }]))).toBeNull();
		expect(check(posted(candidate('One?'), [{ ...rain, body: '' }]))).toBeNull();
	});

	it('refuses more questions than a workbook may hold, and anything of another shape', () => {
		const many = Array.from({ length: MAX_IMPORT_QUESTIONS + 1 }, (_, n) => candidate(`Q${n}?`));
		expect(check({ passages: [], questions: many })).toBeNull();
		expect(check(null)).toBeNull();
		expect(check({ questions: [] })).toBeNull();
	});
});
