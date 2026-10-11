import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';

/** A posted form as an object, without the fields left empty, ready to be parsed. */
export function formValues(form: FormData) {
	return Object.fromEntries([...form].filter(([, value]) => value !== ''));
}

/** What went wrong is logged for us; the person is told only that it did not work. */
export function unexpected(cause: unknown) {
	console.error(cause);
	return fail(500, { message: m.error_unexpected() });
}
