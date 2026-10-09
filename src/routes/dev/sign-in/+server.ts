import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { DEV_ACCOUNTS } from '#lib/dev-accounts.js';
import { resolvePath } from '#lib/paths.js';
import { homePath } from '#lib/roles.js';
import { loadSessionUser } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

/** The password `supabase/seed.sql` gives every test account. */
const SEED_PASSWORD = 'Test1234!';

/**
 * Signs in as one of the seeded test accounts, for the developer tools. It
 * answers only on the dev server: a built app says there is no such page.
 *
 * The dev server does not make SvelteKit's own check that a form was posted
 * from this site, so it is made here: no other page open in the browser can
 * switch the account.
 *
 * Posted to by a plain form, like signing out, so the switch is a full page
 * load and nothing the previous account loaded survives in the browser.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!dev) error(404, 'Not found');
	if (request.headers.get('origin') !== url.origin) error(403, 'Cross-site request');

	const email = (await request.formData()).get('email');
	const account = DEV_ACCOUNTS.find((item) => item.email === email);
	if (!account) error(400, 'Not a test account');

	const { error: signInError } = await locals.supabase.auth.signInWithPassword({
		email: account.email,
		password: SEED_PASSWORD
	});
	if (signInError) error(500, `Could not sign in as ${account.email}: ${signInError.message}`);

	const user = await loadSessionUser(locals.supabase);
	if (!user) error(500, `${account.email} has no profile`);

	redirect(303, resolvePath(homePath(user.role)));
};
