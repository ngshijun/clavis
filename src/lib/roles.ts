import type { Path } from '$app/types';
import type { Database } from '#lib/database.types.js';

export type Role = Database['public']['Enums']['user_role'];

const ROLES: readonly string[] = ['admin', 'manager', 'teacher', 'student'] satisfies Role[];

/**
 * Where a role lands after signing in. An admin's and a teacher's dashboards
 * are the first page of their area. A manager lands on the classroom list
 * they manage. A student's work all happens inside a classroom, and which one
 * is not known yet, so they land on the picker.
 */
export function homePath(role: Role): Path {
	if (role === 'admin' || role === 'teacher') return role;
	return `${role}/classrooms`;
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

	// A manager's and a student's root has no page of its own, so it leads to their home.
	const root = /^\/([a-z]+)\/?$/.exec(pathname)?.[1];
	if (pathname === '/' || (root !== undefined && ROLES.includes(root))) {
		return role === null ? 'login' : homePath(role);
	}

	if (pathname === '/login' && role !== null) return homePath(role);
	return null;
}
