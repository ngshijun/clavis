import { describe, expect, it } from 'vitest';
import {
	chipsToSentence,
	clozeFromBrackets,
	clozeSegments,
	itemSummary,
	sentenceToChips,
	sentenceToWords,
	wordsToSentence
} from './text.js';

describe('clozeFromBrackets', () => {
	it('turns each bracket into a numbered blank with its answers', () => {
		expect(clozeFromBrackets('The [roots|root] take in water. The [stem] carries it.')).toEqual({
			text: 'The {{1}} take in water. The {{2}} carries it.',
			blanks: [
				{ index: 1, accepted: ['roots', 'root'] },
				{ index: 2, accepted: ['stem'] }
			]
		});
	});

	it('trims the answers and drops empty ones', () => {
		expect(clozeFromBrackets('A [ leaf | | daun ] and a [].')).toEqual({
			text: 'A {{1}} and a {{2}}.',
			blanks: [
				{ index: 1, accepted: ['leaf', 'daun'] },
				{ index: 2, accepted: [] }
			]
		});
	});

	it('leaves a text without brackets as it is', () => {
		expect(clozeFromBrackets('No blank here.')).toEqual({ text: 'No blank here.', blanks: [] });
	});
});

describe('clozeSegments', () => {
	it('cuts a text into what is read and where the blanks are', () => {
		expect(clozeSegments('The {{1}} take in water. The {{2}}')).toEqual([
			{ kind: 'text', text: 'The ' },
			{ kind: 'blank', index: 1 },
			{ kind: 'text', text: ' take in water. The ' },
			{ kind: 'blank', index: 2 }
		]);
	});

	it('keeps blanks that touch, and text that has none', () => {
		expect(clozeSegments('{{2}}{{10}}')).toEqual([
			{ kind: 'blank', index: 2 },
			{ kind: 'blank', index: 10 }
		]);
		expect(clozeSegments('根吸收水分。')).toEqual([{ kind: 'text', text: '根吸收水分。' }]);
		expect(clozeSegments('')).toEqual([]);
	});

	it('reads only whole placeholders', () => {
		expect(clozeSegments('{{a}} {1} {{ 1 }}')).toEqual([
			{ kind: 'text', text: '{{a}} {1} {{ 1 }}' }
		]);
	});
});

describe('sentenceToWords', () => {
	it('cuts at the spaces and keeps punctuation on its word', () => {
		expect(sentenceToWords('  The roots grow down,  into the soil. ')).toEqual([
			'The',
			'roots',
			'grow',
			'down,',
			'into',
			'the',
			'soil.'
		]);
		expect(sentenceToWords('   ')).toEqual([]);
	});

	it.each(['The roots grow down, into the soil.', 'Akar menyerap air!', '根 吸收 水分。'])(
		'joins back into the sentence: %s',
		(sentence) => {
			expect(wordsToSentence(sentenceToWords(sentence))).toBe(sentence);
		}
	);
});

describe('sentenceToChips', () => {
	it('cuts at the spaces and gives the closing mark a chip of its own', () => {
		expect(sentenceToChips('Plants need sunlight and water to grow.')).toEqual([
			'Plants',
			'need',
			'sunlight',
			'and',
			'water',
			'to',
			'grow',
			'.'
		]);
		expect(sentenceToChips('Is it tall?!')).toEqual(['Is', 'it', 'tall', '?!']);
	});

	it('leaves punctuation inside the sentence on its word', () => {
		expect(sentenceToChips('Wow! Roots, stems and leaves')).toEqual([
			'Wow!',
			'Roots,',
			'stems',
			'and',
			'leaves'
		]);
	});

	it('cuts Chinese written without spaces into characters', () => {
		expect(sentenceToChips('我爱妈妈。')).toEqual(['我', '爱', '妈', '妈', '。']);
	});

	it('cuts Chinese written with spaces at the spaces', () => {
		expect(sentenceToChips('我 爱 妈妈！')).toEqual(['我', '爱', '妈妈', '！']);
	});

	it('keeps a single word of another script whole', () => {
		expect(sentenceToChips('Stop.')).toEqual(['Stop', '.']);
		expect(sentenceToChips(' ')).toEqual([]);
		expect(sentenceToChips('?')).toEqual(['?']);
	});
});

describe('chipsToSentence', () => {
	it.each([
		'Plants need sunlight and water to grow.',
		'Wow! Is it tall?',
		'Pokok memerlukan cahaya matahari',
		'我爱妈妈。',
		'植物需要阳光和水才能生长！'
	])('spells the sentence its chips were cut from: %s', (sentence) => {
		expect(chipsToSentence(sentenceToChips(sentence))).toBe(sentence);
	});

	it('writes Chinese chips without spaces, whatever their length', () => {
		expect(chipsToSentence(['我', '爱', '妈妈', '。'])).toBe('我爱妈妈。');
	});

	it('is empty for no chips', () => {
		expect(chipsToSentence([])).toBe('');
	});
});

describe('itemSummary', () => {
	it('shows the question on one line', () => {
		expect(
			itemSummary({ type: 'true_false', question: ' A cactus stores\n water. ', answer: true })
		).toBe('A cactus stores water.');
	});

	it('shows a fill-in-the-blanks by its lead-in, or by its text with a rule at each blank', () => {
		const cloze = { type: 'cloze' as const, ...clozeFromBrackets('The [roots] take in [water].') };
		expect(itemSummary({ ...cloze, question: 'Fill in the blanks.' })).toBe('Fill in the blanks.');
		expect(itemSummary(cloze)).toBe('The ____ take in ____.');
		expect(itemSummary({ ...cloze, question: '  ' })).toBe('The ____ take in ____.');
	});

	it('is empty for a question not written yet', () => {
		expect(itemSummary({ type: 'short_answer', question: '', accepted_answers: [] })).toBe('');
	});
});
