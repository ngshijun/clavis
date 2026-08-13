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
import type { SidebarNavConfig } from '@/types'

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
    { title: 'Students', path: '/admin/students', icon: Users },
  ],
  manager: [
    { title: 'Dashboard', path: '/manager/dashboard', icon: LayoutDashboard },
    { title: 'Teachers', path: '/manager/teachers', icon: Users },
    { title: 'Students', path: '/manager/students', icon: Users },
    { title: 'Classrooms', path: '/manager/classrooms', icon: School },
    { title: 'Assessments', path: '/manager/assessments', icon: ClipboardList },
    { title: 'Template Library', path: '/manager/templates', icon: Library },
  ],
  teacher: [
    { title: 'Dashboard', path: '/teacher/dashboard', icon: LayoutDashboard },
    { title: 'Classrooms', path: '/teacher/classrooms', icon: School },
    { title: 'Assessments', path: '/teacher/assessments', icon: ClipboardList },
    { title: 'Template Library', path: '/teacher/templates', icon: Library },
  ],
  student: [
    { title: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/student/announcements', icon: Megaphone },
    { title: 'Practice', path: '/student/practice', icon: PenTool },
    { title: 'Assessments', path: '/student/assessments', icon: ClipboardList },
    { title: 'Statistics', path: '/student/statistics', icon: PieChart },
  ],
}
