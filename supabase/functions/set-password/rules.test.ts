import { describe, expect, it } from 'vitest'
import type { CallerProfile } from '../create-user/provisioning.ts'
import { maySetPassword, parsePasswordChange } from './rules.ts'

const ORG = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG = '22222222-2222-2222-2222-222222222222'

const admin: CallerProfile = { id: 'admin-1', role: 'admin', organizationId: null }
const manager: CallerProfile = { id: 'manager-1', role: 'manager', organizationId: ORG }
const teacher: CallerProfile = { id: 'teacher-1', role: 'teacher', organizationId: ORG }
const student: CallerProfile = { id: 'student-1', role: 'student', organizationId: ORG }

describe('maySetPassword', () => {
  it('lets a manager set the password of a teacher or a student of their organization', () => {
    expect(maySetPassword(manager, teacher)).toBe(true)
    expect(maySetPassword(manager, student)).toBe(true)
  })

  it('keeps a manager out of another organization', () => {
    expect(maySetPassword(manager, { ...teacher, organizationId: OTHER_ORG })).toBe(false)
    expect(maySetPassword(manager, { ...student, organizationId: OTHER_ORG })).toBe(false)
  })

  it('lets a manager set no manager’s or admin’s password, their own included', () => {
    expect(maySetPassword(manager, manager)).toBe(false)
    expect(maySetPassword(manager, { ...manager, id: 'manager-2' })).toBe(false)
    expect(maySetPassword(manager, admin)).toBe(false)
  })

  it.each([
    ['admin', admin],
    ['teacher', teacher],
    ['student', student],
  ])('lets a %s set nobody’s password', (_role, caller) => {
    expect(maySetPassword(caller, teacher)).toBe(false)
    expect(maySetPassword(caller, student)).toBe(false)
    expect(maySetPassword(caller, caller)).toBe(false)
  })

  it('refuses an account that does not exist, and a manager without an organization', () => {
    expect(maySetPassword(manager, null)).toBe(false)
    expect(
      maySetPassword({ ...manager, organizationId: null }, { ...teacher, organizationId: null }),
    ).toBe(false)
  })
})

describe('parsePasswordChange', () => {
  it('reads whose password and what it becomes', () => {
    expect(parsePasswordChange({ userId: ' teacher-1 ', password: ' pass word ' })).toEqual({
      userId: 'teacher-1',
      password: ' pass word ',
    })
  })

  it('refuses a password shorter than 8 or longer than 72 characters', () => {
    expect(parsePasswordChange({ userId: 'teacher-1', password: '1234567' })).toBeNull()
    expect(parsePasswordChange({ userId: 'teacher-1', password: 'x'.repeat(73) })).toBeNull()
    expect(parsePasswordChange({ userId: 'teacher-1', password: 'x'.repeat(72) })).not.toBeNull()
  })

  it('refuses a request that names nobody or is not text', () => {
    expect(parsePasswordChange({ password: 'password123' })).toBeNull()
    expect(parsePasswordChange({ userId: 42, password: 'password123' })).toBeNull()
    expect(parsePasswordChange({ userId: 'teacher-1', password: 12345678 })).toBeNull()
  })
})
