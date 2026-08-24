import { z } from 'zod'

// ==========================================
// Base field schemas (reusable primitives)
// ==========================================

export const emailSchema = z.string().min(1, 'Email is required').email('Invalid email address')

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')

export const nameSchema = z.string().min(1, 'Name is required').trim()

export const requiredStringSchema = (fieldName: string) =>
  z.string().min(1, `${fieldName} is required`).trim()

export const optionalStringSchema = z.string().optional()

// ==========================================
// Form schemas
// ==========================================

// Auth forms
export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type LoginFormValues = z.infer<typeof loginFormSchema>

// Profile forms
export const editNameFormSchema = z.object({
  name: nameSchema,
})
export type EditNameFormValues = z.infer<typeof editNameFormSchema>

// Curriculum forms
export const addCurriculumItemFormSchema = z.object({
  name: requiredStringSchema('Name'),
})
export type AddCurriculumItemFormValues = z.infer<typeof addCurriculumItemFormSchema>

// Organization forms (platform admin)
export const organizationFormSchema = z.object({
  name: requiredStringSchema('Organization name').max(120, 'Name must be 120 characters or less'),
})
export type OrganizationFormValues = z.infer<typeof organizationFormSchema>

// Classrooms & assessments (staff)
export const classroomFormSchema = z.object({
  name: requiredStringSchema('Classroom name').max(120, 'Name must be 120 characters or less'),
  gradeLevelId: requiredStringSchema('Grade level'),
  subjectId: requiredStringSchema('Subject'),
})
export type ClassroomFormValues = z.infer<typeof classroomFormSchema>

export const assessmentCreateFormSchema = z.object({
  title: requiredStringSchema('Title').max(200, 'Title must be 200 characters or less'),
})
export type AssessmentCreateFormValues = z.infer<typeof assessmentCreateFormSchema>

// Admin template creation: a template always carries a grade+subject pairing
// (P8a DB CHECK) — both selectors are required.
export const assessmentTemplateCreateFormSchema = assessmentCreateFormSchema.extend({
  gradeLevelId: requiredStringSchema('Grade level'),
  subjectId: requiredStringSchema('Subject'),
})
export type AssessmentTemplateCreateFormValues = z.infer<typeof assessmentTemplateCreateFormSchema>

// Account provisioning forms.
// Mirrors the server-side rules in supabase/functions/create-user/provisioning.ts.
export const provisionedPasswordSchema = passwordSchema.max(
  72,
  'Password must be 72 characters or less',
)

export const staffAccountFormSchema = z.object({
  name: nameSchema.max(100, 'Name must be 100 characters or less'),
  email: emailSchema,
  password: provisionedPasswordSchema,
})
export type StaffAccountFormValues = z.infer<typeof staffAccountFormSchema>

export const usernameSchema = z
  .string()
  .min(1, 'Username is required')
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,29}$/,
    'Username must be 3-30 characters: letters, numbers, dot, underscore or hyphen',
  )

export const studentAccountFormSchema = z.object({
  name: nameSchema.max(100, 'Name must be 100 characters or less'),
  username: usernameSchema,
  password: provisionedPasswordSchema,
  gradeLevelId: requiredStringSchema('Grade level'),
})
export type StudentAccountFormValues = z.infer<typeof studentAccountFormSchema>

// Contact form
export const contactFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  subject: requiredStringSchema('Subject').max(200, 'Subject must be 200 characters or less'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be 5000 characters or less')
    .trim(),
})
export type ContactFormValues = z.infer<typeof contactFormSchema>

// Contact form (in-app, authenticated — name/email from user profile)
export const contactMessageSchema = contactFormSchema.pick({ subject: true, message: true })
export type ContactMessageValues = z.infer<typeof contactMessageSchema>
