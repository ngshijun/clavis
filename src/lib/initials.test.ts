import { describe, expect, it } from 'vitest';
import { subjectInitial } from './initials.js';

describe('subjectInitial', () => {
	it('takes the first character of the name', () => {
		expect(subjectInitial('数学 Mathematics', '四年级 Year 4')).toBe('数');
		expect(subjectInitial('science', 'Year 4')).toBe('S');
	});

	it('passes over the words the name shares with its grade level', () => {
		expect(subjectInitial('四年级数学 Year 4 Mathematics', '四年级 Year 4')).toBe('数');
		expect(subjectInitial('Year 4 Mathematics', 'Year 4')).toBe('M');
	});

	it('does not take the start of a longer word for the grade level', () => {
		expect(subjectInitial('Yearbook', 'Year 4')).toBe('Y');
	});

	it('falls back to the name itself when the grade level is all of it', () => {
		expect(subjectInitial('Year 4', 'Year 4')).toBe('Y');
	});

	it('copes with a character outside the basic plane and with a blank name', () => {
		expect(subjectInitial('🎨 Art', 'Year 1')).toBe('🎨');
		expect(subjectInitial('  ', 'Year 1')).toBe('?');
	});
});
