import type { Component } from 'svelte';
import type { Path } from '$app/types';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import SchoolIcon from '@lucide/svelte/icons/school';
import { m } from '#lib/paraglide/messages.js';
import type { Role } from '#lib/roles.js';

export interface NavItem {
	label: () => string;
	href: Path;
	icon: Component;
}

/** Where a role chooses a classroom, or for a manager, manages them. */
export function classroomsPath(role: Role): Path {
	return `${role}/classrooms`;
}

export function classroomPath(role: Role, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}/dashboard`;
}

/**
 * The sidebar links for where the person is standing. Inside a classroom the
 * links are that classroom's, whatever the role. Outside one, only a manager
 * has anywhere to go: a teacher and a student are looking at the picker, which
 * is the whole page, and the admin's pages have not been built yet.
 */
export function navItems(role: Role, classroomId: string | undefined): NavItem[] {
	if (classroomId) {
		return [
			{
				label: m.nav_dashboard,
				href: classroomPath(role, classroomId),
				icon: LayoutDashboardIcon
			}
		];
	}
	if (role === 'manager') {
		return [{ label: m.nav_classrooms, href: classroomsPath(role), icon: SchoolIcon }];
	}
	return [];
}
