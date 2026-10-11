import { getLocale } from '#lib/paraglide/runtime.js';

const midnight = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

/**
 * The day a moment falls on, in the reader's language: yesterday, today and
 * tomorrow in words, any other day as its date, with its year when that is
 * not this one. Which day that is depends on where the reader is, so it is
 * only right when worked out in their browser.
 */
export function dayOf(at: Date): string {
	const locale = getLocale();
	const now = new Date();
	const ago = Math.round((midnight(now) - midnight(at)) / 86_400_000);
	if (Math.abs(ago) <= 1) {
		return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-ago, 'day');
	}
	return new Intl.DateTimeFormat(
		locale,
		at.getFullYear() === now.getFullYear()
			? { day: 'numeric', month: 'short' }
			: { dateStyle: 'medium' }
	).format(at);
}

/** The time of day of a moment, to the minute. */
export function timeOf(at: Date): string {
	return new Intl.DateTimeFormat(getLocale(), { timeStyle: 'short' }).format(at);
}

/**
 * The last moment of a day, given as a date field gives it (`2026-10-12`),
 * where the reader is. Undefined when that is not a date.
 */
export function endOfDay(date: string): Date | undefined {
	const [year, month, day] = date.split('-').map(Number);
	const end = new Date(year, month - 1, day, 23, 59, 59, 999);
	return Number.isNaN(end.getTime()) ? undefined : end;
}

/** A day as a date field takes it (`2026-10-12`), where the reader is. */
export function dateField(at: Date): string {
	const pad = (part: number) => String(part).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
