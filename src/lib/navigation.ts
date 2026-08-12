import {
  LayoutDashboard,
  BookOpen,
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
    { title: 'Curriculum', path: '/admin/curriculum', icon: BookOpen },
    { title: 'Question Bank', path: '/admin/question-bank', icon: Database },
    { title: 'Question Statistics', path: '/admin/question-statistics', icon: BarChart3 },
    { title: 'Question Feedback', path: '/admin/question-feedback', icon: MessageSquare },
    { title: 'Students', path: '/admin/students', icon: Users },
  ],
  // Manager and teacher navigation is built in P1c alongside their dashboards.
  manager: [],
  teacher: [],
  student: [
    { title: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { title: 'Announcements', path: '/student/announcements', icon: Megaphone },
    { title: 'Practice', path: '/student/practice', icon: PenTool },
    { title: 'Statistics', path: '/student/statistics', icon: PieChart },
  ],
}
