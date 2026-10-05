import type { Component } from 'svelte';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import ClipboardCheckIcon from '@lucide/svelte/icons/clipboard-check';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import LibraryIcon from '@lucide/svelte/icons/library';
import ListTreeIcon from '@lucide/svelte/icons/list-tree';
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
	return `${role}/classrooms/${classroomId}`;
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
		{ label: m.section_overview, href: classroom, icon: LayoutDashboardIcon },
		{ label: m.section_students, href: `${classroom}/students`, icon: UsersIcon },
		{ label: m.section_assessments, href: `${classroom}/assessments`, icon: ClipboardCheckIcon },
		{ label: m.section_papers, href: `${classroom}/papers`, icon: FileTextIcon },
		{ label: m.section_items, href: `${classroom}/items`, icon: LibraryIcon }
	];
}

/**
 * The section an address is in: the section's own page, or any page beneath
 * it. The overview is the classroom's own address, which every other section
 * sits beneath, so the longest match is the one meant.
 */
export function sectionAt(sections: NavItem[], pathname: string): NavItem | undefined {
	return sections
		.filter((section) => {
			const href = resolve(section.href);
			return pathname === href || pathname.startsWith(`${href}/`);
		})
		.sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * The sidebar links for where the person is standing. An admin's and a
 * teacher's are the same everywhere: the dashboard, with a teacher's classrooms
 * listed beneath it by the sidebar. A manager and a student get the classroom's
 * pages while inside one; outside, only a manager has anywhere to go, because a
 * student is looking at the picker, which is the whole page.
 */
export function navItems(role: Role, classroomId: string | undefined): NavItem[] {
	if (role === 'admin' || role === 'teacher') {
		return [{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon }];
	}
	if (classroomId) return classroomSections(role, classroomId);
	if (role === 'manager') {
		return [{ label: m.nav_classrooms, href: homePath(role), icon: SchoolIcon }];
	}
	return [];
}

/**
 * The pages a role opens from the account menu instead of the sidebar: ones
 * that are set up once and seldom visited again.
 */
export function accountItems(role: Role): NavItem[] {
	if (role === 'admin') {
		return [{ label: m.nav_curriculum, href: 'admin/curriculum', icon: ListTreeIcon }];
	}
	return [];
}

/**
 * The trail to the page at `pathname`, outermost first. It is where a page is
 * named, so no page repeats its name as a heading. A teacher's pages nest
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
		const item = [...navItems(role, classroom?.id), ...accountItems(role)].find(
			(item) => resolve(item.href) === pathname
		);
		return item ? [{ label: item.label(), href: pathname }] : [];
	}

	const trail: Crumb[] = [{ label: m.nav_dashboard(), href: resolve(homePath(role)) }];
	if (!classroom) return trail;

	const overview = classroomPath(role, classroom.id);
	trail.push({ label: classroom.name, href: resolve(overview) });
	// The overview is the classroom's own page, which the classroom's name already stands for.
	const section = sectionAt(classroomSections(role, classroom.id), pathname);
	if (section && section.href !== overview) {
		trail.push({ label: section.label(), href: resolve(section.href) });
	}
	if (title) trail.push({ label: title, href: pathname });
	return trail;
}
