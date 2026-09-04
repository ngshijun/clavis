import {
  LayoutDashboard,
  BookOpen,
  Building2,
  ClipboardList,
  Library,
  PenTool,
  School,
  Users,
  PieChart,
  Tags,
} from 'lucide-vue-next'
import type { NavItem, SidebarNavConfig } from '@/types'

export const sidebarNavConfig: SidebarNavConfig = {
  admin: [
    { title: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { title: 'Organizations', path: '/admin/organizations', icon: Building2 },
    { title: 'Curriculum', path: '/admin/curriculum', icon: BookOpen },
    { title: 'Question Bank', path: '/admin/question-bank', icon: Library },
    { title: 'Templates', path: '/admin/templates', icon: ClipboardList },
    { title: 'Learning Points', path: '/admin/tags', icon: Tags },
  ],
  manager: [
    { title: 'Dashboard', path: '/manager/dashboard', icon: LayoutDashboard },
    { title: 'Teachers', path: '/manager/teachers', icon: Users },
    { title: 'Students', path: '/manager/students', icon: Users },
    { title: 'Classrooms', path: '/manager/classrooms', icon: School },
  ],
  teacher: [],
  student: [],
}

/**
 * A teacher's navigation is classroom-scoped (decision 83): the classroom is a
 * path segment, so the links cannot be static. Outside a classroom there is
 * nothing to show — the picker IS the page, and the sidebar is hidden there.
 *
 * The picker itself is not listed: the classroom header above the nav links
 * back to it (decision 86), so a nav row would be a second door to one room.
 */
export function teacherNavItems(classroomId: string | null): NavItem[] {
  if (!classroomId) return []

  const base = `/teacher/classrooms/${classroomId}`
  return [
    { title: 'Dashboard', path: `${base}/dashboard`, icon: LayoutDashboard, navKey: 'dashboard' },
    { title: 'Students', path: `${base}/students`, icon: Users, navKey: 'students' },
    {
      title: 'Assessments',
      path: `${base}/assessments`,
      icon: ClipboardList,
      navKey: 'assessments',
    },
    {
      title: 'Template Library',
      path: `${base}/templates`,
      icon: Library,
      navKey: 'templateLibrary',
    },
  ]
}

/**
 * A student's navigation is classroom-scoped in the same way a teacher's is
 * (decision 83), and omits the picker for the same reason (decision 86).
 */
export function studentNavItems(classroomId: string | null): NavItem[] {
  if (!classroomId) return []

  const base = `/student/classrooms/${classroomId}`
  return [
    { title: 'Dashboard', path: `${base}/dashboard`, icon: LayoutDashboard, navKey: 'dashboard' },
    { title: 'Practice', path: `${base}/practice`, icon: PenTool, navKey: 'practice' },
    {
      title: 'Assessments',
      path: `${base}/assessments`,
      icon: ClipboardList,
      navKey: 'assessments',
    },
    { title: 'Statistics', path: `${base}/statistics`, icon: PieChart, navKey: 'statistics' },
  ]
}

/**
 * A manager works at two altitudes (decision 87). Outside a classroom the nav
 * is the institution: the org dashboard, the people, the classroom list. Step
 * INTO a classroom and it becomes that classroom's — the same links a teacher
 * of it would see, minus the ones that author material (decision 80).
 *
 * `Students` is the classroom's roster and the way into one student's record.
 * It is a page of its own rather than a section of the dashboard: the dashboard
 * summarises, and a roster you have to scroll a summary to reach is not a
 * roster. The tiles above it count exactly what it lists.
 *
 * Assessments live ONLY at the classroom altitude. Every assessment belongs to
 * a classroom (decision 81), so an org-wide list mixed unrelated classes into
 * one table that could not say which row belonged where — and "which class is
 * this?" is the first question asked of any row in it.
 *
 * The classroom list is not repeated here: the classroom header above the nav
 * links back to it (decision 86).
 */
export function managerNavItems(classroomId: string | null): NavItem[] {
  if (!classroomId) return sidebarNavConfig.manager

  const base = `/manager/classrooms/${classroomId}`
  return [
    { title: 'Dashboard', path: `${base}/dashboard`, icon: LayoutDashboard, navKey: 'dashboard' },
    { title: 'Students', path: `${base}/students`, icon: Users, navKey: 'students' },
    {
      title: 'Assessments',
      path: `${base}/assessments`,
      icon: ClipboardList,
      navKey: 'assessments',
    },
  ]
}
