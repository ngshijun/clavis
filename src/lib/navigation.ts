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
  student: [
    { title: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/student/announcements', icon: Megaphone },
    { title: 'Practice', path: '/student/practice', icon: PenTool },
    { title: 'Assessments', path: '/student/assessments', icon: ClipboardList },
    { title: 'Statistics', path: '/student/statistics', icon: PieChart },
  ],
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
