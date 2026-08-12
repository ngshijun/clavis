import {
  LayoutDashboard,
  BookOpen,
  Building2,
  Database,
  BarChart3,
  MessageSquare,
  PenTool,
  Users,
  PieChart,
  Megaphone,
} from 'lucide-vue-next'
import type { SidebarNavConfig } from '@/types'

export const sidebarNavConfig: SidebarNavConfig = {
  admin: [
    { title: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/admin/announcements', icon: Megaphone },
    { title: 'Organizations', path: '/admin/organizations', icon: Building2 },
    { title: 'Curriculum', path: '/admin/curriculum', icon: BookOpen },
    { title: 'Question Bank', path: '/admin/question-bank', icon: Database },
    { title: 'Question Statistics', path: '/admin/question-statistics', icon: BarChart3 },
    { title: 'Question Feedback', path: '/admin/question-feedback', icon: MessageSquare },
    { title: 'Students', path: '/admin/students', icon: Users },
  ],
  manager: [{ title: 'Teachers', path: '/manager/dashboard', icon: Users }],
  teacher: [{ title: 'Students', path: '/teacher/dashboard', icon: Users }],
  student: [
    { title: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/student/announcements', icon: Megaphone },
    { title: 'Practice', path: '/student/practice', icon: PenTool },
    { title: 'Statistics', path: '/student/statistics', icon: PieChart },
  ],
}
