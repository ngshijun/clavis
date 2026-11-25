import type { Path } from '$app/types';
import type { Database } from '#lib/database.types.js';

export type Role = Database['public']['Enums']['user_role'];

/**
 * Where a role lands after signing in: its dashboard, which is the first
 * page of its area.
 */
export function homePath(role: Role): Path {
	return role;
}

/**
 * Decides whether a request may proceed: returns the path to send the visitor
 * to instead, or null to let it through.
 *
 * `area` is the role whose pages the matched route belongs to, or null when
 * the route is not a signed-in page. It comes from the route the router
 * matched rather than from the address, because the two can be spelled
 * differently: `/%6Danager` is routed as `/manager`.
 *
 * This only keeps people on the pages built for their role. What they may read
 * or change is decided by row level security in the database, not here.
 */
export function redirectFor(pathname: string, area: string | null, role: Role | null): Path | null {
	if (area !== null) {
		if (role === null) return 'login';
		return role === area ? null : homePath(role);
	}

	if (pathname === '/') return role === null ? 'login' : homePath(role);
	if (pathname === '/login' && role !== null) return homePath(role);
	return null;
}
