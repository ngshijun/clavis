import readExcelFile, { parseSheetData, type Schema } from 'read-excel-file/node';
import writeExcelFile, { getSheetData, type Column } from 'write-excel-file/node';
import { uploadRef } from '#lib/item-images.js';
import {
	fileRefusal,
	MAX_IMPORT_QUESTIONS,
	type Candidates,
	type ImportProblem
} from '#lib/items/import.js';
import {
	PASSAGE_SHEET,
	QUESTION_SHEETS,
	README_NAME,
	README_RULES,
	readRows,
	SHEETS,
	type Cells,
	type Pictures,
	type RowProblem,
	type Sheet,
	type SheetRow
} from '#lib/items/sheets.js';
import { m } from '#lib/paraglide/messages.js';
import { readPictures, type PlacedPicture } from './workbook-pictures.js';

/**
 * The import workbook as a file: the template written out, and a filled
 * workbook read back into rows. What the sheets are and what a row means is
 * `items/sheets`; here is only the spreadsheet.
 */

/**
 * A cell as the text a person sees in it. A sheet's cells are all read as
 * text, whatever Excel made of them: a number typed as an answer and TRUE
 * typed under Answer are still what the teacher wrote. A date is not: Excel
 * turns 3/4 into the fourth of March and keeps no trace of what was typed, so
 * the row is refused and says so.
 */
function text(value: unknown): string {
	if (value instanceof Date) throw new Error('date');
	return typeof value === 'boolean' ? String(value).toUpperCase() : String(value);
}

/**
 * A sheet's name or a column's header as it is compared: a teacher's
 * `question ` or `ACCEPTED ANSWERS` is the template's `Question` and
 * `Accepted Answers`.
 */
const plain = (written: unknown) =>
	String(written ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();

/** How a sheet's rows are read: each column found by its header, every cell as text. */
function schemaOf(sheet: Sheet): Schema<Cells> {
	return Object.fromEntries(
		sheet.columns.map((column) => [column.key, { column: column.header, type: text }])
	);
}

/**
 * The fingerprints of the pictures of a workbook that can be used, by each
 * picture's name in the file. The page says which those are, because the
 * workbook is sent without them.
 */
export type PictureMarks = Map<string, string>;

/**
 * The pictures of one row by the key of the column each is in, as a question
 * names a picture not stored yet, or what is wrong with where one is.
 */
function picturesOf(
	sheet: Sheet,
	header: unknown[],
	placed: PlacedPicture[],
	marks: PictureMarks
): { pictures: Pictures } | { fault: RowProblem } {
	const pictures: Pictures = {};
	for (const { column, media } of placed) {
		const found = sheet.columns.find((each) => each.header === header[column]);
		if (!found) return { fault: { column: null, message: m.practice_import_picture_outside() } };
		const refused = (message: string) => ({ fault: { column: found.header, message } });
		if (!found.picture) return refused(m.practice_import_picture_misplaced());
		if (found.key in pictures) return refused(m.practice_import_picture_two());
		const mark = marks.get(media);
		if (!mark) return refused(m.practice_import_picture_unusable());
		pictures[found.key] = uploadRef(mark);
	}
	return { pictures };
}

/**
 * The rows under a sheet's header, each as its cells and pictures or as why
 * they could not be read. A picture below the last row that has words makes
 * a row of its own.
 */
function rowsOf(
	sheet: Sheet,
	header: unknown[],
	rows: unknown[][],
	placed: PlacedPicture[],
	marks: PictureMarks
): SheetRow[] {
	const schema = schemaOf(sheet);
	// The header is row 1, so the first row under it is row 2.
	const numbers = new Set([
		...rows.map((_, index) => index + 2),
		...placed.map((picture) => picture.row).filter((row) => row > 1)
	]);
	return [...numbers]
		.sort((a, b) => a - b)
		.map((row): SheetRow => {
			// One row at a time: a cell that cannot be read fails its row and not the sheet.
			const { objects, errors } = parseSheetData<Cells>(
				[header, rows[row - 2] ?? []] as never,
				schema,
				{ propertyValueWhenCellIsEmpty: '', propertyValueWhenColumnIsMissing: '' }
			);
			if (errors) {
				return { row, fault: { column: errors[0].column, message: m.practice_import_date_cell() } };
			}
			const here = placed.filter((picture) => picture.row === row);
			const read = picturesOf(sheet, header, here, marks);
			// A row with nothing in the sheet's columns comes back as no object at all.
			return 'fault' in read ? { row, ...read } : { row, cells: objects[0] ?? {}, ...read };
		});
}

export type WorkbookReading =
	| { ok: true; candidates: Candidates; problems: ImportProblem[] }
	/** The file as a whole is refused, and `message` says why. */
	| { ok: false; message: string };

/**
 * Reads a filled workbook. A sheet is known by its name, so the sheets a
 * teacher did not need may be deleted and the Read me sheet is passed over.
 *
 * The workbook arrives without its pictures. Where each one sits is still in
 * it, and `marks` says which of them can be used; a row names its pictures
 * `upload:<fingerprint>`.
 */
export async function readWorkbook(
	file: File,
	marks: PictureMarks = new Map()
): Promise<WorkbookReading> {
	const refusal = fileRefusal(file);
	if (refusal) return { ok: false, message: refusal };

	let workbook: Awaited<ReturnType<typeof readExcelFile>>;
	let pictures: ReturnType<typeof readPictures>;
	try {
		const bytes = Buffer.from(await file.arrayBuffer());
		workbook = await readExcelFile(bytes);
		pictures = readPictures(bytes);
	} catch {
		// Not a workbook under its name: an old .xls renamed, a damaged file, an empty one.
		return { ok: false, message: m.practice_import_unreadable() };
	}

	const problems: ImportProblem[] = [];
	const read: { sheet: Sheet; rows: SheetRow[] }[] = [];
	for (const sheet of SHEETS) {
		const found = workbook.find((each) => plain(each.sheet) === plain(sheet.name));
		if (!found) continue;
		const [written = [], ...rows] = found.data;
		// Each header as the template writes it, so a column is found whatever its capitals.
		const header = written.map(
			(cell) => sheet.columns.find((column) => plain(column.header) === plain(cell))?.header ?? cell
		);
		const placed = pictures.get(found.sheet) ?? [];
		if (rows.length === 0 && placed.length === 0) {
			read.push({ sheet, rows: [] });
			continue;
		}
		// Without one of these columns no row of the sheet can be read, so it is said once.
		const missing = sheet.columns.find(
			(column) => column.required && !header.includes(column.header)
		);
		if (missing) {
			problems.push({
				sheet: sheet.name,
				row: 1,
				reason: m.practice_import_missing_column({ column: missing.header })
			});
			continue;
		}
		// A picture has slid up over the header: it is said, and the rows are read all the same.
		if (placed.some((picture) => picture.row === 1)) {
			problems.push({ sheet: sheet.name, row: 1, reason: m.practice_import_picture_header() });
		}
		read.push({ sheet, rows: rowsOf(sheet, header, rows, placed, marks) });
	}
	if (read.length === 0 && problems.length === 0) {
		return { ok: false, message: m.practice_import_no_sheets() };
	}

	const rows = readRows(read);
	if (rows.questionRows > MAX_IMPORT_QUESTIONS) {
		return {
			ok: false,
			message: m.practice_import_too_many({ count: rows.questionRows, max: MAX_IMPORT_QUESTIONS })
		};
	}
	const all = [...problems, ...rows.problems];
	if (rows.questionRows === 0 && all.length === 0) {
		return { ok: false, message: m.practice_import_empty() };
	}
	// In the order of the sheets, as a teacher goes through the file.
	const place = (problem: ImportProblem) =>
		SHEETS.findIndex((sheet) => sheet.name === problem.sheet);
	return {
		ok: true,
		candidates: rows.candidates,
		problems: all.sort((a, b) => place(a) - place(b) || a.row - b.row)
	};
}

/** How many rows under the example are made ready to type into: all a workbook may hold. */
const TEMPLATE_ROWS = MAX_IMPORT_QUESTIONS;

const HEADER = { fontWeight: 'bold', backgroundColor: '#EDE7FB' } as const;

/**
 * A sheet of the template: its header, its example, and empty rows below.
 *
 * Every cell is of the Text format, the empty ones too, because that is what
 * stops Excel from turning 3/4 into a date and 7:30 into a time of day as a
 * teacher types them.
 */
function templateSheet(sheet: Sheet) {
	const columns = sheet.columns.map((column): Column<Cells> => ({
		header: { value: column.header, ...HEADER },
		cell: (row) => ({ value: row[column.key] ?? '', type: String, format: '@' }),
		width: column.width
	}));
	const rows: Cells[] = [sheet.sample, ...Array.from({ length: TEMPLATE_ROWS }, () => ({}))];
	return { sheet: sheet.name, data: getSheetData(rows, columns), columns, stickyRowsCount: 1 };
}

/** The first sheet: the few rules, then what each sheet's columns hold. */
function readMeSheet() {
	const heading = (value: string) => [{ value, fontWeight: 'bold' as const }];
	const line = (value: string) => [{ value, wrap: true, alignVertical: 'top' as const }];
	return {
		sheet: README_NAME,
		columns: [{ width: 120 }],
		data: [
			[
				{
					value: 'Importing practice questions into Clavis',
					fontWeight: 'bold' as const,
					fontSize: 14
				}
			],
			...README_RULES.map(line),
			...SHEETS.flatMap((sheet) => [[], heading(sheet.name), ...sheet.notes.map(line)])
		]
	};
}

/** The empty workbook a teacher downloads: the Read me, a sheet a type, and the passages. */
export async function writeTemplate(): Promise<Buffer> {
	return writeExcelFile([
		readMeSheet(),
		...QUESTION_SHEETS.map(templateSheet),
		templateSheet(PASSAGE_SHEET)
	]).toBuffer();
}
