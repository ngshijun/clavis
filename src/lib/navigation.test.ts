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
      '/manager/classrooms/c1/students',
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

/**
 * Both staff roles reach a classroom's roster the same way (decision 87) — a
 * teacher of the class needs the same answer to "how is this student doing?"
 * as the manager above them.
 */
describe('classroom rosters', () => {
  it('gives both staff roles a Students link inside a classroom', () => {
    expect(teacherNavItems('c1').map((item) => item.navKey)).toContain('students')
    expect(managerNavItems('c1').map((item) => item.navKey)).toContain('students')
  })

  it('points each role at its own route', () => {
    const path = (items: ReturnType<typeof teacherNavItems>) =>
      items.find((item) => item.navKey === 'students')?.path
    expect(path(teacherNavItems('c1'))).toBe('/teacher/classrooms/c1/students')
    expect(path(managerNavItems('c1'))).toBe('/manager/classrooms/c1/students')
  })

  it('offers no roster outside a classroom, since there is no roster to show', () => {
    expect(teacherNavItems(null)).toEqual([])
    // The manager's org-level Students page is the whole institution, not a
    // classroom roster — a different page behind the same word.
    expect(managerNavItems(null).map((item) => item.path)).toContain('/manager/students')
  })
})
