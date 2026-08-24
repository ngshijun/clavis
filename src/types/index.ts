import type { Component } from 'vue'

export type UserType = 'admin' | 'manager' | 'teacher' | 'student'

export interface NavItem {
  title: string
  path: string
  icon: Component
  /**
   * Locale key under `shared.layout.sidebar.nav.<role>`. Required for items
   * whose path is dynamic (a teacher's classroom-scoped links), which the
   * path-to-key map in SidebarNav cannot cover.
   */
  navKey?: string
}

export type SidebarNavConfig = Record<UserType, NavItem[]>
