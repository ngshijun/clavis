import { describe, expect, it } from 'vitest';
import { MAX_PASSAGE_BODY_CHARS, MAX_PASSAGE_TITLE_CHARS } from '#lib/items/limits.js';
import { issueAt } from '#lib/items/schema.js';
import { m } from '#lib/paraglide/messages.js';
import { blankPassage, passageKey, validatePassage } from './passage.js';

describe('validatePassage', () => {
	it('accepts a text, a picture, or both, and tidies them', () => {
		expect(
			validatePassage({ title: ' Aina’s Bean Plant ', body: ' Aina planted a bean. \n' })
		).toEqual({
			ok: true,
			content: { title: 'Aina’s Bean Plant', body: 'Aina planted a bean.', image_path: null }
		});
		expect(
			validatePassage({ title: 'The water cycle', body: '', image_path: 'stages/s/cycle.png' })
		).toEqual({
			ok: true,
			content: { title: 'The water cycle', body: '', image_path: 'stages/s/cycle.png' }
		});
		expect(
			validatePassage({ title: 'Both', body: 'Read on.', image_path: 'upload:key' })
		).toMatchObject({ ok: true, content: { body: 'Read on.', image_path: 'upload:key' } });
	});

	it('keeps the lines of a text as they were written', () => {
		const checked = validatePassage({ title: 'Two lines', body: 'One.\n\nTwo.' });
		expect(checked).toMatchObject({ ok: true, content: { body: 'One.\n\nTwo.' } });
	});

	it('refuses a passage with no title, at the title', () => {
		const checked = validatePassage({ title: '   ', body: 'Text.', image_path: null });
		expect(checked.ok).toBe(false);
		if (checked.ok) return;
		expect(issueAt(checked.issues, 'title')).toBe(m.practice_passage_title_required());
		expect(issueAt(checked.issues, 'body')).toBeUndefined();
	});

	it('refuses a passage with neither a text nor a picture, at the text', () => {
		for (const image_path of [null, undefined, '', '  ']) {
			const checked = validatePassage({ title: 'Empty', body: ' \n ', image_path });
			expect(checked.ok).toBe(false);
			if (checked.ok) return;
			expect(issueAt(checked.issues, 'body')).toBe(m.practice_passage_content_required());
		}
	});

	it('says everything that is wrong with a blank passage at once', () => {
		const checked = validatePassage(blankPassage());
		expect(checked.ok).toBe(false);
		if (checked.ok) return;
		expect(checked.issues.map((issue) => issue.path)).toEqual([['title'], ['body']]);
	});

	it('refuses what is not a passage without words for a field', () => {
		for (const junk of [null, 'passage', [], { title: 7, body: 'x' }, { title: 'x' }]) {
			const checked = validatePassage(junk);
			expect(checked.ok).toBe(false);
			if (checked.ok) return;
			expect(checked.issues[0].message).toBe(m.error_unexpected());
		}
	});
});

describe('how much a passage may hold', () => {
	const refusal = (content: unknown, key: string) => {
		const result = validatePassage(content);
		return result.ok ? undefined : issueAt(result.issues, key);
	};

	it('takes a title and a text up to their lengths, and refuses one character more', () => {
		const title = 'x'.repeat(MAX_PASSAGE_TITLE_CHARS);
		const body = 'x'.repeat(MAX_PASSAGE_BODY_CHARS);
		expect(validatePassage({ title, body }).ok).toBe(true);
		expect(refusal({ title: `${title}x`, body }, 'title')).toBe(
			m.item_text_too_long({ max: MAX_PASSAGE_TITLE_CHARS })
		);
		expect(refusal({ title, body: `${body}x` }, 'body')).toBe(
			m.item_text_too_long({ max: MAX_PASSAGE_BODY_CHARS })
		);
	});

	it('refuses a character the database cannot store, at the field it is in', () => {
		const nul = String.fromCharCode(0);
		expect(refusal({ title: `Rain${nul}`, body: 'It rains.' }, 'title')).toBe(
			m.item_text_unstorable()
		);
		expect(refusal({ title: 'Rain', body: `It${nul} rains.` }, 'body')).toBe(
			m.item_text_unstorable()
		);
	});
});

describe('passageKey', () => {
	it('is the same for a passage that reads the same, whatever its capitals and picture', () => {
		const stored = {
			title: 'The Water Cycle',
			body: 'The sun heats the sea.',
			image_path: 'a.png'
		};
		expect(passageKey({ title: ' the water cycle ', body: 'THE SUN HEATS THE SEA.\n' })).toBe(
			passageKey(stored)
		);
	});

	it('tells passages apart by their title and by their text', () => {
		const passage = { title: 'Rain', body: 'It rains.' };
		expect(passageKey({ ...passage, title: 'Snow' })).not.toBe(passageKey(passage));
		expect(passageKey({ ...passage, body: 'It pours.' })).not.toBe(passageKey(passage));
		// A title is not read on into the text.
		expect(passageKey({ title: 'Rain It', body: 'rains.' })).not.toBe(
			passageKey({ title: 'Rain', body: 'It rains.' })
		);
	});
});
