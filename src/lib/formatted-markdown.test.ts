import { describe, expect, it } from 'vitest';
import { formattedFromMarkdown } from './formatted-markdown.js';
import { plainText } from './formatted-text.js';

describe('formattedFromMarkdown', () => {
	it('makes each line a paragraph, with what HTML escapes escaped', () => {
		expect(formattedFromMarkdown(' a  <b> & c \n\nd ')).toBe(
			'<p>a &lt;b&gt; &amp; c</p><p></p><p>d</p>'
		);
		expect(formattedFromMarkdown('  ')).toBe('');
	});

	it('reads bold, italic, underline and strikethrough, nested too', () => {
		expect(formattedFromMarkdown('**Isi** *tempat* ++kosong++ ~~salah~~')).toBe(
			'<p><strong>Isi</strong> <em>tempat</em> <u>kosong</u> <s>salah</s></p>'
		);
		expect(formattedFromMarkdown('**bold and *italic***')).toBe(
			'<p><strong>bold and <em>italic</em></strong></p>'
		);
	});

	it('makes lines that start with a bullet or a number a list', () => {
		expect(formattedFromMarkdown('Show your working:\n- Count on from 7\n- *Check*')).toBe(
			'<p>Show your working:</p><ul><li><p>Count on from 7</p></li><li><p><em>Check</em></p></li></ul>'
		);
		expect(formattedFromMarkdown('1. One\n2) Two\nAfter')).toBe(
			'<ol><li><p>One</p></li><li><p>Two</p></li></ol><p>After</p>'
		);
		expect(formattedFromMarkdown('3. Three\n- Dot')).toBe(
			'<ol start="3"><li><p>Three</p></li></ol><ul><li><p>Dot</p></li></ul>'
		);
	});

	it('leaves a sum and a lone mark as they are written', () => {
		expect(formattedFromMarkdown('3 * 4 * 5 = ?')).toBe('<p>3 * 4 * 5 = ?</p>');
		expect(formattedFromMarkdown('-5 + 3 = ?')).toBe('<p>-5 + 3 = ?</p>');
		expect(formattedFromMarkdown('a ++ b')).toBe('<p>a ++ b</p>');
	});

	it('keeps a mark that is escaped, and what the format bar has no choice for, as typed', () => {
		expect(formattedFromMarkdown('2\\*3\\*4')).toBe('<p>2*3*4</p>');
		expect(formattedFromMarkdown('1\\. Not a list')).toBe('<p>1. Not a list</p>');
		expect(formattedFromMarkdown('# Title [link](https://x.y) `code`')).toBe(
			'<p># Title [link](https://x.y) `code`</p>'
		);
	});

	it('gives back the words it was given', () => {
		expect(plainText(formattedFromMarkdown('One < two\n**Three**\n- Four'))).toBe(
			'One < two\nThree\nFour'
		);
	});
});
