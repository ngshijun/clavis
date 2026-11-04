import { describe, expect, it } from 'vitest';
import { formattedFromPlain, plainText } from './formatted-text.js';
import { MAX_QUESTION_CHARS } from './items/limits.js';
import { validateItem } from './items/schema.js';
import { m } from './paraglide/messages.js';

describe('plainText', () => {
	it('reads formatted text as its words, a line a paragraph or list item', () => {
		expect(
			plainText('<p><strong>Isi</strong> tempat <u>kosong</u></p><p>a &lt; b &amp; c</p>')
		).toBe('Isi tempat kosong\na < b & c');
		expect(plainText('<ul><li><p>One</p></li><li><p>Two</p></li></ul>')).toBe('One\nTwo');
		expect(plainText('<p></p>')).toBe('');
	});
});

describe('formattedFromPlain', () => {
	it('makes each line a paragraph, with what HTML escapes escaped', () => {
		expect(formattedFromPlain(' a  <b> & c \n\nd ')).toBe(
			'<p>a &lt;b&gt; &amp; c</p><p></p><p>d</p>'
		);
		expect(formattedFromPlain('  ')).toBe('');
	});

	it('gives back the words it was given', () => {
		expect(plainText(formattedFromPlain('One < two\nThree'))).toBe('One < two\nThree');
	});
});

describe('a formatted question', () => {
	const short = (question: string) =>
		validateItem({ type: 'short_answer', question, accepted_answers: ['x'] });

	it('is counted as it reads, without its formatting', () => {
		const words = 'a'.repeat(MAX_QUESTION_CHARS);
		expect(short(`<p><strong>${words}</strong></p>`).ok).toBe(true);
		expect(short(`<p>${words}a</p>`)).toMatchObject({
			ok: false,
			issues: [{ path: ['question'], message: m.item_text_too_long({ max: MAX_QUESTION_CHARS }) }]
		});
	});

	it('must say something', () => {
		expect(short('<p></p>')).toMatchObject({
			ok: false,
			issues: [{ path: ['question'], message: m.item_question_required() }]
		});
	});
});
