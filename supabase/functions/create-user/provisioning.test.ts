import { describe, it, expect } from 'vitest'
import {
  planProvisioning,
  isProvisionError,
  type CallerProfile,
  type ProvisionPlan,
} from './provisioning.ts'

const ORG = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG = '22222222-2222-2222-2222-222222222222'

const admin: CallerProfile = { id: 'admin-1', role: 'admin', organizationId: null }
const manager: CallerProfile = { id: 'manager-1', role: 'manager', organizationId: ORG }
const teacher: CallerProfile = { id: 'teacher-1', role: 'teacher', organizationId: ORG }
const student: CallerProfile = { id: 'student-1', role: 'student', organizationId: ORG }

function plan(result: ReturnType<typeof planProvisioning>): ProvisionPlan {
  if (isProvisionError(result)) {
    throw new Error(`expected a plan, got ${result.code}: ${result.detail}`)
  }
  return result
}

describe('planProvisioning — hierarchy', () => {
  it('lets an admin create a manager in an explicit organization', () => {
    const result = plan(
      planProvisioning(admin, {
        role: 'manager',
        name: 'Mandy',
        email: 'Mandy@Center.com',
        password: 'password123',
        organizationId: ORG,
      }),
    )
    expect(result).toMatchObject({
      role: 'manager',
      email: 'mandy@center.com',
      organizationId: ORG,
      username: null,
      createdBy: null,
    })
  })

  it('lets a manager create a teacher in the manager’s own organization', () => {
    const result = plan(
      planProvisioning(manager, {
        role: 'teacher',
        name: 'Tina',
        email: 'tina@center.com',
        password: 'password123',
        // A hostile client cannot redirect the account into another org.
        organizationId: OTHER_ORG,
      }),
    )
    expect(result.organizationId).toBe(ORG)
  })

  it('lets a manager create a student stamped with created_by and a synthetic email', () => {
    const result = plan(
      planProvisioning(manager, {
        role: 'student',
        name: 'Sam',
        username: 'Sam.Lee',
        password: 'password123',
        gradeLevelId: 'grade-1',
      }),
    )
    expect(result).toMatchObject({
      role: 'student',
      username: 'sam.lee',
      email: 'sam.lee@student.clavis.app',
      organizationId: ORG,
      gradeLevelId: 'grade-1',
      createdBy: 'manager-1',
    })
  })

  it.each([
    ['admin', admin, 'teacher'],
    ['admin', admin, 'student'],
    ['manager', manager, 'manager'],
    ['teacher', teacher, 'manager'],
    ['teacher', teacher, 'teacher'],
    ['teacher', teacher, 'student'],
    ['student', student, 'student'],
    ['student', student, 'teacher'],
  ])('rejects %s → %s', (_callerRole, caller, role) => {
    const result = planProvisioning(caller as CallerProfile, {
      role,
      name: 'Nobody',
      email: 'nobody@center.com',
      username: 'nobody',
      password: 'password123',
      organizationId: ORG,
      gradeLevelId: 'grade-1',
    })
    expect(result).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('rejects org staff with no organization', () => {
    const orphan: CallerProfile = { id: 'm2', role: 'manager', organizationId: null }
    const result = planProvisioning(orphan, {
      role: 'teacher',
      name: 'Tina',
      email: 'tina@center.com',
      password: 'password123',
    })
    expect(result).toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('planProvisioning — validation', () => {
  it('rejects an unknown role', () => {
    const result = planProvisioning(admin, {
      role: 'superuser',
      name: 'X',
      password: 'password123',
    })
    expect(result).toMatchObject({ code: 'INVALID_INPUT', status: 400 })
  })

  it.each([
    ['missing name', { name: '   ' }],
    ['short password', { password: 'short' }],
    ['long password', { password: 'p'.repeat(73) }],
    ['missing organizationId', { organizationId: '' }],
    ['malformed email', { email: 'not-an-email' }],
  ])('rejects %s for a manager', (_label, override) => {
    const result = planProvisioning(admin, {
      role: 'manager',
      name: 'Mandy',
      email: 'mandy@center.com',
      password: 'password123',
      organizationId: ORG,
      ...override,
    })
    expect(result).toMatchObject({ code: 'INVALID_INPUT' })
  })

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(31)],
    ['leading symbol', '.sam'],
    ['spaces', 'sam lee'],
    ['at sign', 'sam@lee'],
  ])('rejects username %s', (_label, username) => {
    const result = planProvisioning(manager, {
      role: 'student',
      name: 'Sam',
      username,
      password: 'password123',
      gradeLevelId: 'grade-1',
    })
    expect(result).toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('rejects a student without a grade level', () => {
    const result = planProvisioning(manager, {
      role: 'student',
      name: 'Sam',
      username: 'samlee',
      password: 'password123',
    })
    expect(result).toMatchObject({ code: 'INVALID_INPUT' })
  })
})
