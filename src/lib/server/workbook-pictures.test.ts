import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';
import { readPictures } from './workbook-pictures.js';

/** A picture to write into a workbook, with its top left corner in the cell given (both from 1). */
const image = (name: string, row: number, column: number) => ({
	content: Buffer.from(name),
	contentType: 'image/png',
	width: 10,
	height: 10,
	dpi: 96,
	anchor: { row, column }
});

const cell = (value: string) => ({ value });

async function written(sheets: Parameters<typeof writeExcelFile>[0]): Promise<Uint8Array> {
	return new Uint8Array(await writeExcelFile(sheets).toBuffer());
}

/** A workbook with some of its parts written over, or added. */
function patched(workbook: Uint8Array, parts: Record<string, string | ((xml: string) => string)>) {
	const files = unzipSync(workbook);
	for (const [name, part] of Object.entries(parts)) {
		files[name] = strToU8(typeof part === 'string' ? part : part(strFromU8(files[name])));
	}
	return zipSync(files);
}

describe('readPictures', () => {
	it('finds no picture in a workbook that has none', async () => {
		const workbook = await written([{ sheet: 'One', data: [[cell('Question')]] }]);
		expect(readPictures(workbook)).toEqual(new Map([['One', []]]));
	});

	it('places a floating picture at the cell its top left corner is in, sheet by sheet', async () => {
		const workbook = await written([
			{
				sheet: 'One',
				data: [[cell('Question'), cell('Picture')]],
				images: [image('cat', 2, 2), image('dog', 5, 1)]
			},
			{ sheet: 'Two', data: [[cell('Question')]] },
			{ sheet: 'Three', data: [[cell('Question')]], images: [image('cow', 1, 3)] }
		]);
		const pictures = readPictures(workbook);
		expect([...pictures.keys()]).toEqual(['One', 'Two', 'Three']);
		expect(pictures.get('One')?.map(({ row, column }) => [row, column])).toEqual([
			[2, 1],
			[5, 0]
		]);
		expect(pictures.get('Two')).toEqual([]);
		expect(pictures.get('Three')?.map(({ row, column }) => [row, column])).toEqual([[1, 2]]);

		// Each names the file of the workbook that is its picture.
		const files = unzipSync(workbook);
		const [cat, dog] = pictures.get('One') ?? [];
		expect(strFromU8(files[cat.media])).toBe('cat');
		expect(strFromU8(files[dog.media])).toBe('dog');
	});

	it('reads where the pictures are from a workbook that comes without them', async () => {
		const workbook = await written([
			{ sheet: 'One', data: [[cell('Question')]], images: [image('cat', 3, 1)] }
		]);
		const files = unzipSync(workbook);
		const media = Object.keys(files).filter((name) => name.startsWith('xl/media/'));
		for (const name of media) delete files[name];

		expect(readPictures(zipSync(files)).get('One')).toEqual([
			{ row: 3, column: 0, media: media[0] }
		]);
	});

	it('reads an anchor between two cells, whatever prefix the file gives its names', async () => {
		const workbook = patched(
			await written([{ sheet: 'One', data: [[cell('Question')]], images: [image('cat', 2, 1)] }]),
			{
				'xl/drawings/drawing1.xml': (xml) =>
					xml
						.replaceAll('oneCellAnchor', 'twoCellAnchor')
						.replace(
							/<xdr:ext [^>]*\/>/,
							'<xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>9</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
						)
						.replaceAll('xdr:', 'd:')
						.replace('xmlns:xdr=', 'xmlns:d=')
			}
		);
		expect(
			readPictures(workbook)
				.get('One')
				?.map(({ row, column }) => [row, column])
		).toEqual([[2, 0]]);
	});

	it('passes over a picture that is only linked to, which the file does not hold', async () => {
		const workbook = patched(
			await written([{ sheet: 'One', data: [[cell('Question')]], images: [image('cat', 2, 1)] }]),
			{
				'xl/drawings/_rels/drawing1.xml.rels': (xml) =>
					xml.replace(
						/Target="[^"]*"/,
						'Target="https://example.com/cat.png" TargetMode="External"'
					)
			}
		);
		expect(readPictures(workbook).get('One')).toEqual([]);
	});

	/**
	 * Excel 365 keeps a picture placed in a cell as the cell's value: the cell
	 * names a record of the workbook's metadata, which names a rich value,
	 * which names a place in a list of pictures. Every list below is in another
	 * order than the one before it, so each step has to be followed.
	 */
	const RICH = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
	const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
	const inCells = {
		'xl/worksheets/sheet1.xml': (xml: string) =>
			xml.replace(
				'</sheetData>',
				'<row r="3"><c r="B3" t="e" vm="1"><v>#VALUE!</v></c><c r="AA3" t="e" vm="2"><v>#VALUE!</v></c></row>' +
					'<row r="4"><c r="C4" t="e" vm="3"><v>#VALUE!</v></c></row></sheetData>'
			),
		'xl/metadata.xml':
			`<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="${RICH}">` +
			'<metadataTypes count="2"><metadataType name="XLDAPR"/><metadataType name="XLRICHVALUE"/></metadataTypes>' +
			'<futureMetadata name="XLRICHVALUE" count="3">' +
			[2, 0, 1]
				.map((value) => `<bk><extLst><ext uri="{x}"><xlrd:rvb i="${value}"/></ext></extLst></bk>`)
				.join('') +
			'</futureMetadata>' +
			'<valueMetadata count="3"><bk><rc t="2" v="1"/></bk><bk><rc t="2" v="2"/></bk><bk><rc t="2" v="0"/></bk></valueMetadata>' +
			'</metadata>',
		'xl/richData/rdrichvaluestructure.xml':
			`<rvStructures xmlns="${RICH}" count="2">` +
			'<s t="_linkedentity"><k n="_DisplayString" t="s"/></s>' +
			'<s t="_localImage"><k n="CalcOrigin" t="i"/><k n="_rvRel:LocalImageIdentifier" t="i"/></s>' +
			'</rvStructures>',
		'xl/richData/rdrichvalue.xml':
			`<rvData xmlns="${RICH}" count="3">` +
			'<rv s="1"><v>5</v><v>1</v></rv><rv s="1"><v>5</v><v>0</v></rv><rv s="0"><v>Stock</v></rv>' +
			'</rvData>',
		'xl/richData/richValueRel.xml':
			`<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="${RELATIONSHIPS}">` +
			'<rel r:id="rId1"/><rel r:id="rId2"/></richValueRels>',
		'xl/richData/_rels/richValueRel.xml.rels':
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			`<Relationship Id="rId1" Type="${RELATIONSHIPS}/image" Target="../media/image1.png"/>` +
			`<Relationship Id="rId2" Type="${RELATIONSHIPS}/image" Target="../media/image2.png"/>` +
			'</Relationships>'
	};

	it('places a picture that is a cell’s value at that cell', async () => {
		const workbook = patched(
			await written([{ sheet: 'One', data: [[cell('Question')]], images: [image('cat', 2, 1)] }]),
			inCells
		);
		const [floating, ...placed] = readPictures(workbook).get('One') ?? [];
		expect([floating.row, floating.column]).toEqual([2, 0]);
		expect(placed).toEqual([
			// B3 names the first record, which names the first rich value, whose picture is the second.
			{ row: 3, column: 1, media: 'xl/media/image2.png' },
			// AA3 names the second record, which names the second rich value, whose picture is the first.
			{ row: 3, column: 26, media: 'xl/media/image1.png' }
			// C4 names a rich value that is no picture.
		]);
	});

	it('throws for bytes that are no workbook', () => {
		expect(() => readPictures(strToU8('not a workbook'))).toThrow();
	});
});
