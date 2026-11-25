import { getLocale } from '#lib/paraglide/runtime.js';

/**
 * The first moment of the day a moment falls on, or of one so many days from
 * it, where the reader is.
 */
export function startOfDay(at: Date, days = 0): number {
	return new Date(at.getFullYear(), at.getMonth(), at.getDate() + days).getTime();
}

/** The first moment of the week a moment falls in, where the reader is: its Monday. */
export function startOfWeek(at: Date): number {
	return startOfDay(at, -((at.getDay() + 6) % 7));
}

/**
 * The day a moment falls on, in the reader's language: yesterday, today and
 * tomorrow in words, any other day as its date, with its year when that is
 * not this one. Which day that is depends on where the reader is, so it is
 * only right when worked out in their browser.
 */
export function dayOf(at: Date): string {
	const locale = getLocale();
	const now = new Date();
	const ago = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
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
