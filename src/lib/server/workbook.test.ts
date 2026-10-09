import readExcelFile from 'read-excel-file/node';
import writeExcelFile, { type SheetData } from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_QUESTIONS, MAX_WORKBOOK_BYTES } from '#lib/items/import.js';
import {
	PASSAGE_SHEET,
	QUESTION_SHEETS,
	README_NAME,
	SHEETS,
	type Sheet
} from '#lib/items/sheets.js';
import { m } from '#lib/paraglide/messages.js';
import { splitWorkbook } from '#lib/workbook.js';
import { readWorkbook, writeTemplate } from './workbook.js';

const file = (content: Buffer | string, name = 'questions.xlsx') =>
	new File([typeof content === 'string' ? content : new Uint8Array(content)], name);

/** A workbook of the sheets given, each as its rows of cells. */
async function workbook(sheets: Record<string, SheetData>, name?: string): Promise<File> {
	const written = await writeExcelFile(
		Object.entries(sheets).map(([sheet, data]) => ({ sheet, data }))
	).toBuffer();
	return file(written, name);
}

const sheetNamed = (name: string) => {
	const sheet = SHEETS.find((each) => each.name === name);
	if (!sheet) throw new Error(`No sheet ${name}`);
	return sheet;
};
const headers = (sheet: Sheet) => sheet.columns.map((column) => column.header);
/** A row of a sheet: its example, with the cells given (by header) written over it. */
const rowOf = (sheet: Sheet, cells: Record<string, unknown> = {}) =>
	sheet.columns.map((column) =>
		column.header in cells ? cells[column.header] : (sheet.sample[column.key] ?? null)
	) as never[];

const short = sheetNamed('Short Answer');
const number = sheetNamed('Number');

async function read(sheets: Record<string, SheetData>) {
	const reading = await readWorkbook(await workbook(sheets));
	if (!reading.ok) throw new Error(reading.message);
	return reading;
}

describe('writeTemplate', () => {
	it('writes the Read me, then a sheet a type, then the passages', async () => {
		const sheets = await readExcelFile(await writeTemplate());
		expect(sheets.map((each) => each.sheet)).toEqual([
			README_NAME,
			...QUESTION_SHEETS.map((sheet) => sheet.name),
			PASSAGE_SHEET.name
		]);
	});

	it('gives each sheet its header row and its example, and nothing else', async () => {
		const sheets = await readExcelFile(await writeTemplate());
		for (const sheet of SHEETS) {
			const written = sheets.find((each) => each.sheet === sheet.name)?.data;
			expect(written).toEqual([
				headers(sheet),
				sheet.columns.map((column) => sheet.sample[column.key] ?? null)
			]);
		}
	});

	it('explains every sheet on the Read me', async () => {
		const [readMe] = await readExcelFile(await writeTemplate());
		const lines = readMe.data.map((row) => row[0]);
		for (const sheet of SHEETS) {
			expect(lines).toContain(sheet.name);
			for (const note of sheet.notes) expect(lines).toContain(note);
		}
	});
});

describe('readWorkbook', () => {
	it('refuses the template as it was downloaded, and points at filling it in', async () => {
		const reading = await readWorkbook(file(await writeTemplate()));
		expect(reading).toEqual({ ok: false, message: m.practice_import_empty() });
	});

	it('reads a question typed under the example of the template’s own sheet', async () => {
		const reading = await read({
			[README_NAME]: [['Importing practice questions into Clavis']],
			'Short Answer': [
				headers(short),
				rowOf(short),
				rowOf(short, { Question: 'Which gas do animals breathe in?', 'Accepted Answers': 'oxygen' })
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toEqual([
			{
				payload: {
					type: 'short_answer',
					question: 'Which gas do animals breathe in?',
					accepted_answers: ['oxygen']
				},
				difficulty: 'medium',
				passage: null
			}
		]);
	});

	it('knows a sheet by its name in any capitals, and passes over the ones it does not know', async () => {
		const reading = await read({
			Notes: [['Mine'], ['Do not read this.']],
			' short answer ': [headers(short), rowOf(short, { Question: 'One?' })]
		});
		expect(reading.candidates.questions).toHaveLength(1);
	});

	it('ignores empty rows, between the questions and after them', async () => {
		const empty = short.columns.map(() => null);
		// A cell with only a format, as the template's waiting rows have.
		const formatted = short.columns.map(() => ({ value: '', type: String, format: '@' }));
		const reading = await read({
			'Short Answer': [
				headers(short),
				rowOf(short, { Question: 'One?' }),
				empty,
				rowOf(short, { Question: '' }),
				formatted,
				formatted
			]
		});
		expect(reading.candidates.questions.map((each) => each.payload.question)).toEqual(['One?']);
		expect(reading.problems).toEqual([
			{
				sheet: 'Short Answer',
				row: 4,
				reason: m.practice_import_at_column({
					column: 'Question',
					message: m.item_question_required()
				})
			}
		]);
	});

	it('reads a number and a boolean as what was typed', async () => {
		const trueFalse = sheetNamed('True or False');
		const reading = await read({
			Number: [
				headers(number),
				rowOf(number, {
					Question: 'Half of 25?',
					'Answer Form': null,
					Answer: 12.5,
					'Accept Equal Answers': null
				})
			],
			'True or False': [
				headers(trueFalse),
				rowOf(trueFalse, { Statement: 'Ice is a solid.', Answer: true })
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions.map((each) => each.payload)).toMatchObject([
			{ type: 'true_false', answer: true },
			{ type: 'numeric', answer: 12.5 }
		]);
	});

	it('knows a column by its header in any capitals, and with spaces around it', async () => {
		const reading = await read({
			'Short Answer': [
				['question ', '  ACCEPTED   answers'],
				['One?', 'yes']
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toMatchObject([
			{ payload: { question: 'One?', accepted_answers: ['yes'] } }
		]);
	});

	it('holds back a row whose cell Excel has turned into a date, and names the cell', async () => {
		const reading = await read({
			Number: [
				headers(number),
				rowOf(number, {
					Question: 'What fraction is shaded?',
					Answer: { value: new Date(Date.UTC(2026, 2, 4)), type: Date, format: 'd-mmm' }
				})
			]
		});
		expect(reading.candidates.questions).toEqual([]);
		expect(reading.problems).toEqual([
			{
				sheet: 'Number',
				row: 2,
				reason: m.practice_import_at_column({
					column: 'Answer',
					message: m.practice_import_date_cell()
				})
			}
		]);
	});

	it('says once that a sheet has lost a column it cannot be read without', async () => {
		const reading = await read({
			'Short Answer': [
				['Question', 'Jawapan'],
				['One?', 'yes'],
				['Two?', 'no']
			]
		});
		expect(reading.candidates.questions).toEqual([]);
		expect(reading.problems).toEqual([
			{
				sheet: 'Short Answer',
				row: 1,
				reason: m.practice_import_missing_column({ column: 'Accepted Answers' })
			}
		]);
	});

	it('reads a sheet whose optional columns were deleted or moved', async () => {
		const reading = await read({
			'Short Answer': [
				['Accepted Answers', 'My notes', 'Question'],
				['yes', 'ask Aina', 'One?']
			]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions).toMatchObject([
			{ payload: { question: 'One?', accepted_answers: ['yes'] }, difficulty: 'medium' }
		]);
	});

	it('joins questions to the passages of the Passages sheet', async () => {
		const reading = await read({
			Passages: [headers(PASSAGE_SHEET), ['R1', '雨', null, '下雨了。\n天空很暗。']],
			'Short Answer': [headers(short), rowOf(short, { Question: '天气怎样？', Passage: 'r1' })]
		});
		expect(reading.problems).toEqual([]);
		expect(reading.candidates).toMatchObject({
			passages: [{ code: 'r1', title: '雨', body: '下雨了。\n天空很暗。' }],
			questions: [{ passage: 'r1', payload: { question: '天气怎样？' } }]
		});
	});

	it('lists the rows to fix sheet by sheet as the template has them', async () => {
		const reading = await read({
			Passages: [headers(PASSAGE_SHEET), ['R1', '', null, 'No title.']],
			'Short Answer': [headers(short), rowOf(short, { Question: '' })],
			Number: [headers(number), rowOf(number, { Answer: 'three quarters' })]
		});
		expect(reading.problems.map((each) => [each.sheet, each.row])).toEqual([
			['Short Answer', 2],
			['Number', 2],
			['Passages', 2]
		]);
	});

	it('refuses a file that is not an .xlsx, or too large, before it is opened', async () => {
		expect(await readWorkbook(file('a,b', 'questions.csv'))).toEqual({
			ok: false,
			message: m.practice_import_not_xlsx()
		});
		const large = file('x'.repeat(MAX_WORKBOOK_BYTES + 1));
		expect(await readWorkbook(large)).toEqual({
			ok: false,
			message: m.practice_import_too_large()
		});
	});

	it('refuses a file that is a workbook only by its name', async () => {
		for (const content of ['', 'Question,Answer\nOne?,yes']) {
			expect(await readWorkbook(file(content))).toEqual({
				ok: false,
				message: m.practice_import_unreadable()
			});
		}
	});

	it('refuses a workbook with none of the sheets, and points at the template', async () => {
		const reading = await readWorkbook(await workbook({ Sheet1: [['Question'], ['One?']] }));
		expect(reading).toEqual({ ok: false, message: m.practice_import_no_sheets() });
	});

	it('refuses a workbook with only headers, or only passages', async () => {
		const empty = await readWorkbook(await workbook({ 'Short Answer': [headers(short)] }));
		expect(empty).toEqual({ ok: false, message: m.practice_import_empty() });
		const passages = await readWorkbook(
			await workbook({ Passages: [headers(PASSAGE_SHEET), ['R1', 'Rain', null, 'It rains.']] })
		);
		expect(passages).toEqual({ ok: false, message: m.practice_import_empty() });
	});

	it('refuses more question rows than one workbook may hold', async () => {
		const rows = Array.from({ length: MAX_IMPORT_QUESTIONS + 1 }, (_, n) => [
			`Question ${n}?`,
			'yes'
		]);
		const full = await readWorkbook(
			await workbook({ 'Short Answer': [['Question', 'Accepted Answers'], ...rows.slice(1)] })
		);
		expect(full).toMatchObject({ ok: true });
		const over = await readWorkbook(
			await workbook({ 'Short Answer': [['Question', 'Accepted Answers'], ...rows] })
		);
		expect(over).toEqual({
			ok: false,
			message: m.practice_import_too_many({
				count: MAX_IMPORT_QUESTIONS + 1,
				max: MAX_IMPORT_QUESTIONS
			})
		});
	});
});

describe('readWorkbook, with pictures', () => {
	const choice = sheetNamed('Multiple Choice');

	/** A picture of a sheet, known by `name`, its top left corner in the cell of a column and a row. */
	const picture = (sheet: Sheet, header: string | number, row: number, name: string) => ({
		content: Buffer.from(name),
		contentType: 'image/png',
		width: 10,
		height: 10,
		dpi: 96,
		anchor: {
			row,
			column: typeof header === 'number' ? header : headers(sheet).indexOf(header) + 1
		}
	});
	/** What stands for the fingerprint of the picture known by `name`. */
	const mark = (name: string) => Buffer.from(name).toString('hex').padEnd(32, '0').slice(0, 32);
	const named = (name: string) => `upload:${mark(name)}`;

	/**
	 * Reads a workbook as the page sends it: without its pictures, and with
	 * the fingerprint of each one that can be used.
	 */
	async function readPictured(
		sheets: { sheet: string; data: SheetData; images?: ReturnType<typeof picture>[] }[],
		unusable: string[] = []
	) {
		const written = await writeExcelFile(sheets as never).toBuffer();
		const { workbook: stripped, media } = splitWorkbook(new Uint8Array(written));
		const marks = new Map<string, string>();
		for (const [path, bytes] of media) {
			const name = Buffer.from(bytes).toString();
			if (!unusable.includes(name)) marks.set(path, mark(name));
		}
		const reading = await readWorkbook(file(Buffer.from(stripped)), marks);
		if (!reading.ok) throw new Error(reading.message);
		return reading;
	}

	it('gives a question the picture in its Picture cell, and an option the one in its own', async () => {
		const reading = await readPictured([
			{
				sheet: choice.name,
				data: [
					headers(choice),
					rowOf(choice),
					rowOf(choice, { Question: 'Which is the root?', 'Option B': null, Tip: null })
				],
				images: [
					picture(choice, 'Picture', 3, 'plant'),
					picture(choice, 'Option A', 3, 'roots'),
					picture(choice, 'Option B', 3, 'stem')
				]
			}
		]);
		expect(reading.problems).toEqual([]);
		expect(reading.candidates.questions.map((each) => each.payload)).toEqual([
			{
				type: 'mcq',
				question: 'Which is the root?',
				image_path: named('plant'),
				options: [
					{ text: 'Roots', image_path: named('roots'), is_correct: true },
					{ text: '', image_path: named('stem'), is_correct: false },
					{ text: 'Leaf', is_correct: false },
					{ text: 'Flower', is_correct: false }
				]
			}
		]);
	});

	it('reads the example once it has a picture, and a passage that is only a picture', async () => {
		const reading = await readPictured([
			{
				sheet: short.name,
				data: [headers(short), rowOf(short, { Passage: 'P1' })],
				images: [picture(short, 'Picture', 2, 'leaf')]
			},
			{
				sheet: PASSAGE_SHEET.name,
				data: [headers(PASSAGE_SHEET), ['P1', 'A Poster', null, null]],
				images: [picture(PASSAGE_SHEET, 'Picture', 2, 'poster')]
			}
		]);
		expect(reading.problems).toEqual([]);
		expect(reading.candidates).toMatchObject({
			passages: [{ code: 'p1', title: 'A Poster', body: '', image_path: named('poster') }],
			questions: [{ passage: 'p1', payload: { image_path: named('leaf') } }]
		});
	});

	it('holds back a row whose picture is where none is taken, and says where', async () => {
		const row = (question: string) => rowOf(short, { Question: question });
		const reading = await readPictured(
			[
				{
					sheet: short.name,
					data: [
						headers(short),
						row('One?'),
						row('Two?'),
						row('Three?'),
						row('Four?'),
						row('Five?')
					],
					images: [
						picture(short, 'Picture', 1, 'slid up'),
						picture(short, 'Accepted Answers', 2, 'misplaced'),
						picture(short, headers(short).length + 3, 3, 'outside'),
						picture(short, 'Picture', 4, 'first'),
						picture(short, 'Picture', 4, 'second'),
						picture(short, 'Picture', 5, 'drawing'),
						picture(short, 'Picture', 6, 'good'),
						picture(short, 'Picture', 9, 'alone')
					]
				}
			],
			['drawing']
		);
		const at = (column: string, message: string) =>
			m.practice_import_at_column({ column, message });
		expect(reading.problems).toEqual([
			{ sheet: short.name, row: 1, reason: m.practice_import_picture_header() },
			{
				sheet: short.name,
				row: 2,
				reason: at('Accepted Answers', m.practice_import_picture_misplaced())
			},
			{ sheet: short.name, row: 3, reason: m.practice_import_picture_outside() },
			{ sheet: short.name, row: 4, reason: at('Picture', m.practice_import_picture_two()) },
			{ sheet: short.name, row: 5, reason: at('Picture', m.practice_import_picture_unusable()) },
			// A picture under the last question is a row of its own, which asks nothing.
			{ sheet: short.name, row: 9, reason: at('Question', m.item_question_required()) }
		]);
		expect(reading.candidates.questions.map((each) => each.payload)).toMatchObject([
			{ question: 'Five?', image_path: named('good') }
		]);
	});

	it('refuses words typed where the picture goes', async () => {
		const reading = await readPictured([
			{ sheet: short.name, data: [headers(short), rowOf(short, { Picture: 'leaf.png' })] }
		]);
		expect(reading.problems).toEqual([
			{
				sheet: short.name,
				row: 2,
				reason: m.practice_import_at_column({
					column: 'Picture',
					message: m.practice_import_picture_words()
				})
			}
		]);
	});
});
