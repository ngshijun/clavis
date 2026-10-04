import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { m } from '#lib/paraglide/messages.js';
import { homePath } from '#lib/roles.js';
import { loadSessionUser } from '#lib/server/session.js';
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
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) {
			const message = AUTH_MESSAGES[error.code ?? '']?.() ?? m.error_unexpected();
			return fail(400, { email, message });
		}

		const user = await loadSessionUser(locals.supabase);
		if (!user) {
			await locals.supabase.auth.signOut();
			return fail(400, { email, message: m.auth_no_profile() });
		}

		redirect(303, resolve(homePath(user.role)));
	}
};
