import { fail } from '@sveltejs/kit';
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod';
import type { Database } from '#lib/database.types.js';
import { m } from '#lib/paraglide/messages.js';
import { formValues, unexpected } from '#lib/server/forms.js';
import {
	MAX_NAME_LENGTH,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	USERNAME_PATTERN
} from '../../../supabase/functions/create-user/provisioning.ts';

/**
 * Accounts opened for the people of an organization: its teachers and
 * students by one of its managers, and its managers by an admin. Opening one
 * and setting its password afresh are the work of the `create-user` and
 * `set-password` functions, done with a key this server never holds: each
 * reads who is asking from their session and decides what they may do. The
 * limits checked here are the functions' own, so a form is told what is wrong
 * in words before a function is asked.
 */

const name = z
	.string({ error: () => m.person_name_required() })
	.trim()
	.min(1, { error: () => m.person_name_required() })
	.max(MAX_NAME_LENGTH, { error: () => m.person_name_too_long() });

const password = z
	.string({ error: () => m.person_password_invalid() })
	.min(MIN_PASSWORD_LENGTH, { error: () => m.person_password_invalid() })
	.max(MAX_PASSWORD_LENGTH, { error: () => m.person_password_invalid() });

const email = z
	.string({ error: () => m.person_email_invalid() })
	.trim()
	.toLowerCase()
	.pipe(z.email({ error: () => m.person_email_invalid() }));

/** What each kind of account is opened with. Every field is a line of text. */
const schemas: Record<'student' | 'teacher' | 'manager', z.ZodType<Record<string, string>>> = {
	student: z.object({
		name,
		username: z
			.string({ error: () => m.person_username_invalid() })
			.trim()
			.toLowerCase()
			.regex(USERNAME_PATTERN, { error: () => m.person_username_invalid() }),
		gradeLevelId: z.guid({ error: () => m.form_grade_required() }),
		password
	}),
	teacher: z.object({ name, email, password }),
	manager: z.object({ name, email, password })
};

/** The function's refusals that are the form's to put right, each on the field it is about. */
const refusals: Record<string, () => Record<string, string[]>> = {
	USERNAME_TAKEN: () => ({ username: [m.person_username_taken()] }),
	EMAIL_TAKEN: () => ({ email: [m.person_email_taken()] }),
	GRADE_LEVEL_NOT_FOUND: () => ({ gradeLevelId: [m.form_grade_required()] })
};

/**
 * Opens an account from a posted form: a student's or a teacher's in the
 * manager's own organization, or a manager's in the organization an admin
 * names. It answers as a form action does: nothing when the account was
 * opened, and otherwise a failure carrying the fields to put right.
 */
export async function createPerson(
	supabase: SupabaseClient<Database>,
	role: keyof typeof schemas,
	form: FormData,
	/** The organization a new manager is for. A manager's own is read from their session. */
	organizationId?: string
) {
	const parsed = schemas[role].safeParse(formValues(form));
	if (!parsed.success) {
		return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
	}

	const { error } = await supabase.functions.invoke('create-user', {
		body: { role, ...parsed.data, organizationId }
	});
	if (!error) return;

	if (error instanceof FunctionsHttpError) {
		const answer: unknown = await (error.context as Response).json().catch(() => null);
		const code = z.object({ error: z.string() }).safeParse(answer).data?.error;
		const errors = code ? refusals[code]?.() : undefined;
		if (errors) return fail(409, { errors });
	}
	return unexpected(error);
}

/**
 * Sets a new password for a teacher or a student of the manager's
 * organization, from a posted form naming them as `personId`. It answers as
 * a form action does: nothing when the password was set, and otherwise a
 * failure carrying the fields to put right.
 */
export async function resetPassword(supabase: SupabaseClient<Database>, form: FormData) {
	const parsed = z.object({ personId: z.guid(), password }).safeParse(formValues(form));
	if (!parsed.success) {
		return fail(400, { errors: z.flattenError(parsed.error).fieldErrors });
	}

	const { error } = await supabase.functions.invoke('set-password', {
		body: { userId: parsed.data.personId, password: parsed.data.password }
	});
	if (error) return unexpected(error);
}
