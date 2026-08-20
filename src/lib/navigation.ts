import {
  LayoutDashboard,
  BookOpen,
  Building2,
  ClipboardList,
  BarChart3,
  Library,
  MessageSquare,
  PenTool,
  School,
  Users,
  PieChart,
  Megaphone,
  Tags,
} from 'lucide-vue-next'
import type { NavItem, SidebarNavConfig } from '@/types'

export const sidebarNavConfig: SidebarNavConfig = {
  admin: [
    { title: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/admin/announcements', icon: Megaphone },
    { title: 'Organizations', path: '/admin/organizations', icon: Building2 },
    { title: 'Curriculum', path: '/admin/curriculum', icon: BookOpen },
    { title: 'Question Bank', path: '/admin/question-bank', icon: Library },
    { title: 'Assessment Templates', path: '/admin/assessments', icon: ClipboardList },
    { title: 'Learning Points', path: '/admin/tags', icon: Tags },
    { title: 'Question Statistics', path: '/admin/question-statistics', icon: BarChart3 },
    { title: 'Question Feedback', path: '/admin/question-feedback', icon: MessageSquare },
  ],
  manager: [
    { title: 'Dashboard', path: '/manager/dashboard', icon: LayoutDashboard },
    { title: 'Teachers', path: '/manager/teachers', icon: Users },
    { title: 'Students', path: '/manager/students', icon: Users },
    { title: 'Classrooms', path: '/manager/classrooms', icon: School },
    { title: 'Assessments', path: '/manager/assessments', icon: ClipboardList },
  ],
  teacher: [],
  student: [],
}

/**
 * A teacher's navigation is classroom-scoped (decision 83): the classroom is a
 * path segment, so the links cannot be static. Outside a classroom only the
 * picker is offered — there is nowhere else meaningful to go.
 */
export function teacherNavItems(classroomId: string | null): NavItem[] {
  const picker: NavItem = {
    title: 'Classrooms',
    path: '/teacher/classrooms',
    icon: School,
    navKey: 'classrooms',
  }
  if (!classroomId) return [picker]

  const base = `/teacher/classrooms/${classroomId}`
  return [
    picker,
    { title: 'Dashboard', path: `${base}/dashboard`, icon: LayoutDashboard, navKey: 'dashboard' },
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
 * (decision 83). Announcements stay outside the classroom — they are
 * organization-wide, not class news.
 */
export function studentNavItems(classroomId: string | null): NavItem[] {
  const picker: NavItem = {
    title: 'Classes',
    path: '/student/classrooms',
    icon: School,
    navKey: 'classrooms',
  }
  const announcements: NavItem = {
    title: 'Announcements',
    path: '/student/announcements',
    icon: Megaphone,
    navKey: 'announcements',
  }
  if (!classroomId) return [picker, announcements]

  const base = `/student/classrooms/${classroomId}`
  return [
    picker,
    { title: 'Dashboard', path: `${base}/dashboard`, icon: LayoutDashboard, navKey: 'dashboard' },
    { title: 'Practice', path: `${base}/practice`, icon: PenTool, navKey: 'practice' },
    {
      title: 'Assessments',
      path: `${base}/assessments`,
      icon: ClipboardList,
      navKey: 'assessments',
    },
    { title: 'Statistics', path: `${base}/statistics`, icon: PieChart, navKey: 'statistics' },
    announcements,
  ]
}
