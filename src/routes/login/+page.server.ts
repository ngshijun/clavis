import { fail, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
import { homePath } from '#lib/roles.js';
import { loadSessionUser } from '#lib/server/session.js';
import { studentEmail } from '../../../supabase/functions/create-user/provisioning.ts';
import type { Actions } from './$types';

/** Auth error codes worth their own wording; anything else gets the generic message. */
const AUTH_MESSAGES: Record<string, () => string> = {
	invalid_credentials: m.auth_invalid_credentials,
	email_not_confirmed: m.auth_email_not_confirmed,
	over_request_rate_limit: m.auth_rate_limited
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		// A student is known by a username and everyone else by an email, which an @ tells apart.
		const email = username.includes('@') ? username : studentEmail(username);

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			const message = AUTH_MESSAGES[error.code ?? '']?.() ?? m.error_unexpected();
			return fail(400, { username, message });
		}

		const user = await loadSessionUser(locals.supabase);
		if (!user) {
			await locals.supabase.auth.signOut();
			return fail(400, { username, message: m.auth_no_profile() });
		}

		redirect(303, resolvePath(homePath(user.role)));
	}
};
