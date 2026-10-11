import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '$app/env/private';
import type { Database } from '#lib/database.types.js';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { resolvePath } from '#lib/paths.js';
import { redirectFor } from '#lib/roles.js';
import { loadSessionUser } from '#lib/server/session.js';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

/**
 * One Supabase client per request, carrying the visitor's session cookie. It
 * uses the publishable key, so every query runs as that person and the
 * database decides what they may see.
 */
const handleSession: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies, headers) => {
				for (const { name, value, options } of cookies) {
					// Only this server reads the session, so page scripts are kept away from the tokens.
					event.cookies.set(name, value, { ...options, path: '/', httpOnly: true });
				}
				// A response that sets a session cookie must never be cached and served to someone else.
				event.setHeaders(headers);
			}
		}
	});
	event.locals.user = await loadSessionUser(event.locals.supabase);

	return resolve(event);
};

/**
 * Every signed-in page lives in the `(app)` group under a segment naming its
 * role (`admin`, `manager`, `teacher`, `student`). That segment is read off
 * the matched route, so the check is made against the page that is about to
 * run rather than against how its address was typed.
 */
const handleRole: Handle = ({ event, resolve: resolveEvent }) => {
	const area = event.route.id?.match(/^\/\(app\)\/([^/]+)/)?.[1] ?? null;

	const destination = redirectFor(event.url.pathname, area, event.locals.user?.role ?? null);
	if (destination !== null) redirect(303, resolvePath(destination));
	return resolveEvent(event);
};

export const handle: Handle = sequence(handleParaglide, handleSession, handleRole);
