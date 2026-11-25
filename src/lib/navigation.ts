import type { Component } from 'svelte';
import { resolve } from '$app/paths';
import type { Path } from '$app/types';
import Building2Icon from '@lucide/svelte/icons/building-2';
import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
import ListTreeIcon from '@lucide/svelte/icons/list-tree';
import SchoolIcon from '@lucide/svelte/icons/school';
import TagsIcon from '@lucide/svelte/icons/tags';
import TargetIcon from '@lucide/svelte/icons/target';
import UsersIcon from '@lucide/svelte/icons/users';
import { m } from '#lib/paraglide/messages.js';
import { resolvePath } from '#lib/paths.js';
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

/**
 * What every signed-in page shares, the person and their classrooms, as
 * something to `invalidate`: it is not read again on a move between pages.
 */
export const ACCOUNT = 'app:account';

/** The roles that have classrooms. An admin works above every classroom and has none. */
export type ClassroomRole = Exclude<Role, 'admin'>;

/**
 * The roles that follow a classroom's students: its teachers, and the
 * managers of its organization, who read what a teacher reads.
 */
export type StaffRole = Exclude<ClassroomRole, 'student'>;

/** A manager's classrooms: the page every classroom of the organization is opened from. */
export const MANAGER_CLASSROOMS: Path = 'manager/classrooms';

/** A classroom's first page. */
export function classroomPath(role: ClassroomRole, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}`;
}

/** A classroom's practice, as its staff follow it or as a student does it. */
export function classroomPracticePath(role: ClassroomRole, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}/practice`;
}

/** A classroom's students, as its staff follow them. */
export function classroomStudentsPath(role: StaffRole, classroomId: string): Path {
	return `${role}/classrooms/${classroomId}/students`;
}

/** One student of a classroom, as its staff follow them. */
export function studentPath(role: StaffRole, classroomId: string, studentId: string): Path {
	return `${role}/classrooms/${classroomId}/students/${studentId}`;
}

/** One assignment of a classroom, as its staff follow it. */
export function assignmentPath(role: StaffRole, classroomId: string, assignmentId: string): Path {
	return `${role}/classrooms/${classroomId}/assignments/${assignmentId}`;
}

/** One finished practice session of a student, as the classroom's staff read it. */
export function sessionPath(
	role: StaffRole,
	classroomId: string,
	studentId: string,
	sessionId: string
): Path {
	return `${role}/classrooms/${classroomId}/students/${studentId}/sessions/${sessionId}`;
}

/** One organization, as an admin sets it up: its managers. */
export function organizationPath(organizationId: string): Path {
	return `admin/organizations/${organizationId}`;
}

/**
 * The practice home with one grade level's subjects showing. The grade level
 * is in the query, so this is an address to link to rather than a typed path.
 */
export function practiceGradeHref(gradeId: string): string {
	return `${resolve('admin/practice')}?grade=${gradeId}`;
}

/**
 * A teacher's or a manager's dashboard of one of their classrooms, or of all
 * of them when none is named. The classroom is in the query, as the grade
 * level above is.
 */
export function dashboardHref(role: StaffRole, classroomId: string | null): string {
	const dashboard = resolvePath(homePath(role));
	return classroomId ? `${dashboard}?classroom=${classroomId}` : dashboard;
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
	const subject = resolvePath(practiceSubjectPath(stage.subject.id));
	return [
		{ label: stage.grade.name, href: practiceGradeHref(stage.grade.id) },
		{ label: stage.subject.name, href: subject },
		// A topic has no page of its own: it is a section of its subject's.
		{ label: stage.topic.name, href: `${subject}#${stage.topic.id}` }
	];
}

/** A stage for a student to practise in one of their classrooms. */
export function classroomStagePath(classroomId: string, stageId: string): Path {
	return `student/classrooms/${classroomId}/practice/${stageId}`;
}

/** Every practice session a student has finished in one of their classrooms, the latest first. */
export function classroomHistoryPath(classroomId: string): Path {
	return `student/classrooms/${classroomId}/practice/history`;
}

/** One of a student's own finished practice sessions in one of their classrooms, read back. */
export function classroomSessionPath(classroomId: string, sessionId: string): Path {
	return `student/classrooms/${classroomId}/practice/sessions/${sessionId}`;
}

/**
 * The pages inside a classroom, in the order they are offered: the tabs under
 * its banner. The first is the classroom's own address. Everyone's classroom
 * opens on what has been assigned there, then its practice; its staff have
 * its students after that, and a manager, who keeps its rosters, its
 * teachers too.
 */
export function classroomSections(role: ClassroomRole, classroomId: string): NavItem[] {
	const sections: NavItem[] = [
		{ label: m.section_overview, href: classroomPath(role, classroomId), icon: ClipboardListIcon },
		{ label: m.nav_practice, href: classroomPracticePath(role, classroomId), icon: TargetIcon }
	];
	if (role === 'student') return sections;

	sections.push({
		label: m.section_students,
		href: classroomStudentsPath(role, classroomId),
		icon: UsersIcon
	});
	if (role === 'manager') {
		sections.push({
			label: m.section_teachers,
			href: `manager/classrooms/${classroomId}/teachers`,
			icon: GraduationCapIcon
		});
	}
	return sections;
}

/**
 * The section an address is in: the section's own page, or any page beneath
 * it. The first section is the classroom's own address, which every other
 * section sits beneath, so the longest match is the one meant.
 */
export function sectionAt(sections: NavItem[], pathname: string): NavItem | undefined {
	return sections
		.filter((section) => {
			const href = resolvePath(section.href);
			return pathname === href || pathname.startsWith(`${href}/`);
		})
		.sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Whether a sidebar link is the one for the page at `pathname`: its own page,
 * or a page beneath it. A link to the role's root is current only on its own
 * page, since every page of the role sits beneath it.
 */
export function isCurrent(item: NavItem, role: Role, pathname: string): boolean {
	const href = resolvePath(item.href);
	return pathname === href || (item.href !== role && pathname.startsWith(`${href}/`));
}

/**
 * The sidebar links of a role: its top level, the same wherever the person is
 * standing. Everyone's first is their dashboard. A teacher's and a student's
 * classrooms are listed beneath it by the sidebar. A manager's classrooms are
 * too many to list and are a page, beside the people of the organization.
 */
export function navItems(role: Role): NavItem[] {
	if (role === 'admin') {
		return [
			{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon },
			{ label: m.nav_organizations, href: 'admin/organizations', icon: Building2Icon },
			{ label: m.nav_practice, href: 'admin/practice', icon: TargetIcon },
			{ label: m.nav_learning_points, href: 'admin/learning-points', icon: TagsIcon }
		];
	}
	if (role === 'manager') {
		return [
			{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon },
			{ label: m.nav_classrooms, href: MANAGER_CLASSROOMS, icon: SchoolIcon },
			{ label: m.section_students, href: 'manager/students', icon: UsersIcon },
			{ label: m.section_teachers, href: 'manager/teachers', icon: GraduationCapIcon }
		];
	}
	return [{ label: m.nav_dashboard, href: homePath(role), icon: LayoutDashboardIcon }];
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
 * It starts with what the address alone tells: outside a classroom the
 * sidebar or account link the page sits under, inside one the page the
 * classroom is opened from, the classroom and its section. A teacher's and a
 * student's classrooms are opened from the sidebar, so their trail starts at
 * the dashboard; a manager's are opened from their page of classrooms. A page
 * nested deeper says the rest itself, in what its load returns: `trail` for
 * the pages between, `title` for its own name.
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

	if (role === 'admin' || !classroom) {
		const item = sectionAt([...navItems(role), ...accountItems(role)], pathname);
		return item ? [{ label: item.label(), href: resolvePath(item.href) }, ...below] : [];
	}

	const first = classroomPath(role, classroom.id);
	const trail: Crumb[] = [
		role === 'manager'
			? { label: m.nav_classrooms(), href: resolvePath(MANAGER_CLASSROOMS) }
			: { label: m.nav_dashboard(), href: resolvePath(homePath(role)) },
		{ label: classroom.name, href: resolvePath(first) }
	];
	// The first section is the classroom's own page, which the classroom's name already stands for.
	const section = sectionAt(classroomSections(role, classroom.id), pathname);
	if (section && section.href !== first) {
		trail.push({ label: section.label(), href: resolvePath(section.href) });
	}
	return [...trail, ...below];
}
