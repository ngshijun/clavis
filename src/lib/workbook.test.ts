import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { splitWorkbook } from './workbook.js';

describe('splitWorkbook', () => {
	const parts = {
		'xl/workbook.xml': strToU8('<workbook/>'),
		'xl/drawings/drawing1.xml': strToU8('<wsDr/>'),
		'xl/drawings/_rels/drawing1.xml.rels': strToU8('<Relationships/>'),
		'xl/media/image1.png': strToU8('one'),
		'xl/media/image2.emf': strToU8('two')
	};

	it('takes the pictures out, by their name in the file, and leaves the rest a workbook', () => {
		const { workbook, media } = splitWorkbook(zipSync(parts));
		expect([...media.keys()]).toEqual(['xl/media/image1.png', 'xl/media/image2.emf']);
		expect(media.get('xl/media/image1.png')).toEqual(strToU8('one'));
		// What says where a picture sits stays, so the workbook can still be asked.
		expect(Object.keys(unzipSync(workbook))).toEqual([
			'xl/workbook.xml',
			'xl/drawings/drawing1.xml',
			'xl/drawings/_rels/drawing1.xml.rels'
		]);
	});

	it('leaves a workbook with no pictures whole', () => {
		const { workbook, media } = splitWorkbook(
			zipSync({ 'xl/workbook.xml': parts['xl/workbook.xml'] })
		);
		expect(media.size).toBe(0);
		expect(Object.keys(unzipSync(workbook))).toEqual(['xl/workbook.xml']);
	});

	it('throws for bytes that are no zip', () => {
		expect(() => splitWorkbook(strToU8('not a workbook'))).toThrow();
	});
});
