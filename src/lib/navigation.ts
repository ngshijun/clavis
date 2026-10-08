import type { Component } from 'svelte';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ListTreeIcon from '@lucide/svelte/icons/list-tree';
import SchoolIcon from '@lucide/svelte/icons/school';
import TargetIcon from '@lucide/svelte/icons/target';
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

/** The roles that have classrooms. An admin works above every classroom and has none. */
type ClassroomRole = Exclude<Role, 'admin'>;

/** A classroom's first page. */
export function classroomPath(role: ClassroomRole, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}`;
}

export function studentPath(classroomId: string, studentId: string): Path {
	return `teacher/classrooms/${classroomId}/students/${studentId}`;
}

/**
 * The practice home with one grade level's subjects showing. The grade level
 * is in the query, so this is an address to link to rather than a typed path.
 */
export function practiceGradeHref(gradeId: string): string {
	return `${resolve('admin/practice')}?grade=${gradeId}`;
}

/** A subject's practice: its topics, each with its stages. */
export function practiceSubjectPath(subjectId: string): Path {
	return `admin/practice/${subjectId}`;
}

/** One stage's questions and the builder. */
export function practiceStagePath(subjectId: string, stageId: string): Path {
	return `admin/practice/${subjectId}/${stageId}`;
}

/** The pages a stage sits under: its grade level, its subject and its topic. */
export function stageTrail(stage: {
	grade: { id: string; name: string };
	subject: { id: string; name: string };
	topic: { id: string; name: string };
}): Crumb[] {
	const subject = resolve(practiceSubjectPath(stage.subject.id));
	return [
		{ label: stage.grade.name, href: practiceGradeHref(stage.grade.id) },
		{ label: stage.subject.name, href: subject },
		// A topic has no page of its own: it is a section of its subject's.
		{ label: stage.topic.name, href: `${subject}#${stage.topic.id}` }
	];
}

/** A stage for a student to practise in one of their classrooms. */
export function classroomStagePath(classroomId: string, stageId: string): Path {
	return `student/classrooms/${classroomId}/${stageId}`;
}

/**
 * The pages inside a classroom, in the order they are offered. A teacher gets
 * them as tabs under the classroom's banner. A manager's and a student's
 * classroom has one page so far, which they get as a sidebar link: a manager's
 * says what the classroom is, a student's is its practice.
 */
export function classroomSections(role: ClassroomRole, classroomId: string): NavItem[] {
	if (role === 'student') {
		return [{ label: m.nav_practice, href: classroomPath(role, classroomId), icon: TargetIcon }];
	}
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
		{ label: m.section_students, href: `${classroom}/students`, icon: UsersIcon }
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
 * Whether a sidebar link is the one for the page at `pathname`: its own page,
 * or a page beneath it. The link home is current only on its own page, since
 * every page of the role sits beneath it.
 */
export function isCurrent(item: NavItem, role: Role, pathname: string): boolean {
	const href = resolve(item.href);
	return pathname === href || (item.href !== homePath(role) && pathname.startsWith(`${href}/`));
}

/**
 * The sidebar links for where the person is standing. An admin's and a
 * teacher's are the same everywhere: the dashboard, with a teacher's classrooms
 * listed beneath it by the sidebar. A manager and a student get the classroom's
 * pages while inside one and the list of their classrooms outside.
 */
export function navItems(role: Role, classroomId: string | undefined): NavItem[] {
	if (role === 'admin') {
		return [
			{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon },
			{ label: m.nav_practice, href: 'admin/practice', icon: TargetIcon }
		];
	}
	if (role === 'teacher') {
		return [{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon }];
	}
	if (classroomId) return classroomSections(role, classroomId);
	return [{ label: m.nav_classrooms, href: homePath(role), icon: SchoolIcon }];
}

/**
 * The pages a role opens from the account menu instead of the sidebar: ones
 * that are set up once and seldom visited again. Each opens a page, so its
 * name carries no ellipsis.
 */
export function accountItems(role: Role): NavItem[] {
	if (role === 'admin') {
		return [{ label: m.nav_curriculum, href: 'admin/curriculum', icon: ListTreeIcon }];
	}
	return [];
}

/**
 * The trail to the page at `pathname`, outermost first. It is where a page is
 * named, so no page repeats its name as a heading, and it is the way back up.
 *
 * It starts with what the address alone tells: for a teacher the dashboard,
 * the classroom and the classroom's section, for everyone else the sidebar or
 * account link the page sits under. A page nested deeper says the rest itself,
 * in what its load returns: `trail` for the pages between, `title` for its own
 * name.
 */
export function breadcrumbs(
	role: Role,
	classroom: Classroom | undefined,
	pathname: string,
	detail: Pick<App.PageData, 'trail' | 'title'>
): Crumb[] {
	const below: Crumb[] = [
		...(detail.trail ?? []),
		...(detail.title ? [{ label: detail.title, href: pathname }] : [])
	];

	if (role !== 'teacher') {
		const item = sectionAt([...navItems(role, classroom?.id), ...accountItems(role)], pathname);
		return item ? [{ label: item.label(), href: resolve(item.href) }, ...below] : [];
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
	return [...trail, ...below];
}
