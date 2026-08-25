import { describe, it, expect } from 'vitest'
import { managerNavItems, sidebarNavConfig, teacherNavItems } from './navigation'

/**
 * A manager navigates at two altitudes (decision 87): the institution, and one
 * classroom they have stepped into. The altitude is decided solely by whether
 * the route names a classroom, so these are the two cases worth pinning.
 */
describe('managerNavItems', () => {
  it('shows the institution links outside a classroom', () => {
    expect(managerNavItems(null)).toBe(sidebarNavConfig.manager)
  })

  it('never offers assessments at the institution altitude', () => {
    // Every assessment belongs to one classroom (decision 81), so an org-wide
    // list could not say which class a row was for.
    expect(managerNavItems(null).map((item) => item.path)).not.toContain('/manager/assessments')
  })

  it('switches to that classroom inside one', () => {
    expect(managerNavItems('c1').map((item) => item.path)).toEqual([
      '/manager/classrooms/c1/dashboard',
      '/manager/classrooms/c1/assessments',
    ])
  })

  it('omits the authoring links a teacher gets (decision 80)', () => {
    const managerKeys = managerNavItems('c1').map((item) => item.navKey)
    const teacherKeys = teacherNavItems('c1').map((item) => item.navKey)
    expect(teacherKeys).toContain('templateLibrary')
    expect(managerKeys).not.toContain('templateLibrary')
  })
})
