import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types';

/**
 * Posted to by a plain form, so signing out is a full page load and nothing
 * the previous person loaded survives in the browser.
 */
export const POST: RequestHandler = async ({ locals }) => {
	await locals.supabase.auth.signOut();
	redirect(303, resolve('login'));
};
