import type { Component } from 'svelte';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import LibraryIcon from '@lucide/svelte/icons/library';
import SchoolIcon from '@lucide/svelte/icons/school';
import UsersIcon from '@lucide/svelte/icons/users';
import { m } from '#lib/paraglide/messages.js';
import { homePath, type Role } from '#lib/roles.js';
import type { Classroom } from '#lib/server/classrooms.js';

export interface NavItem {
	label: () => string;
	href: Path;
	icon: Component;
}

export interface Crumb {
	label: string;
	href: string;
}

/** A classroom's first page. */
export function classroomPath(role: Role, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}/dashboard`;
}

export function studentPath(classroomId: string, studentId: string): Path {
	return `teacher/classrooms/${classroomId}/students/${studentId}`;
}

/**
 * The pages inside a classroom, in the order they are offered. A teacher gets
 * them as tabs under the classroom's banner. A manager's and a student's
 * classroom has one page so far, which they get as a sidebar link.
 */
export function classroomSections(role: Role, classroomId: string): NavItem[] {
	if (role !== 'teacher') {
		return [
			{
				label: m.nav_dashboard,
				href: classroomPath(role, classroomId),
				icon: LayoutDashboardIcon
			}
		];
	}

	const classroom = `teacher/classrooms/${classroomId}` as const;
	return [
		{ label: m.section_overview, href: `${classroom}/dashboard`, icon: LayoutDashboardIcon },
		{ label: m.section_students, href: `${classroom}/students`, icon: UsersIcon },
		{ label: m.section_assessments, href: `${classroom}/assessments`, icon: ClipboardCheckIcon },
		{ label: m.section_papers, href: `${classroom}/papers`, icon: FileTextIcon },
		{ label: m.section_items, href: `${classroom}/items`, icon: LibraryIcon }
	];
}

/** The section an address is in: the section's own page, or any page beneath it. */
export function sectionAt(sections: NavItem[], pathname: string): NavItem | undefined {
	return sections.find((section) => {
		const href = resolve(section.href);
		return pathname === href || pathname.startsWith(`${href}/`);
	});
}

/**
 * The sidebar links for where the person is standing. A teacher's are the same
 * everywhere: the dashboard, with their classrooms listed beneath it by the
 * sidebar. A manager and a student get the classroom's pages while inside one;
 * outside, only a manager has anywhere to go, because a student is looking at
 * the picker, which is the whole page, and the admin's pages are not built yet.
 */
export function navItems(role: Role, classroomId: string | undefined): NavItem[] {
	if (role === 'teacher') {
		return [{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon }];
	}
	if (classroomId) return classroomSections(role, classroomId);
	if (role === 'manager') {
		return [{ label: m.nav_classrooms, href: homePath(role), icon: SchoolIcon }];
	}
	return [];
}

/**
 * The trail to the page at `pathname`, outermost first. A teacher's pages nest
 * (dashboard, classroom, section, then whatever a detail page says it shows),
 * so the trail is the way back up. Everyone else's pages are one level deep
 * and the trail is just the page's name.
 */
export function breadcrumbs(
	role: Role,
	classroom: Classroom | undefined,
	pathname: string,
	title: string | undefined
): Crumb[] {
	if (role !== 'teacher') {
		const item = navItems(role, classroom?.id).find((item) => resolve(item.href) === pathname);
		return item ? [{ label: item.label(), href: pathname }] : [];
	}

	const trail: Crumb[] = [{ label: m.nav_dashboard(), href: resolve(homePath(role)) }];
	if (!classroom) return trail;

	trail.push({ label: classroom.name, href: resolve(classroomPath(role, classroom.id)) });
	const section = sectionAt(classroomSections(role, classroom.id), pathname);
	if (section) trail.push({ label: section.label(), href: resolve(section.href) });
	if (title) trail.push({ label: title, href: pathname });
	return trail;
}
