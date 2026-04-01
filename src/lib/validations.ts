import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'

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
const loginFormZod = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export const loginFormSchema = toTypedSchema(loginFormZod)
export type LoginFormValues = z.infer<typeof loginFormZod>

const signupFormZod = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    userType: z.enum(['student', 'parent'], {
      required_error: 'Please select a user type',
    }),
    dateOfBirth: z.string().optional(),
    schoolId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export const signupFormSchema = toTypedSchema(signupFormZod)
export type SignupFormValues = z.infer<typeof signupFormZod>

// Invitation forms
const inviteEmailFormZod = z.object({
  email: emailSchema,
})
export const inviteEmailFormSchema = toTypedSchema(inviteEmailFormZod)
export type InviteEmailFormValues = z.infer<typeof inviteEmailFormZod>

// Profile forms
const editNameFormZod = z.object({
  name: nameSchema,
})
export const editNameFormSchema = toTypedSchema(editNameFormZod)
export type EditNameFormValues = z.infer<typeof editNameFormZod>

// Question feedback form
const questionFeedbackFormZod = z.object({
  category: z.enum(
    ['question_error', 'image_error', 'option_error', 'answer_error', 'explanation_error', 'other'],
    {
      required_error: 'Please select an issue type',
    },
  ),
  details: z.string().optional(),
})
export const questionFeedbackFormSchema = toTypedSchema(questionFeedbackFormZod)
export type QuestionFeedbackFormValues = z.infer<typeof questionFeedbackFormZod>

// Curriculum forms
const addCurriculumItemFormZod = z.object({
  name: requiredStringSchema('Name'),
})
export const addCurriculumItemFormSchema = toTypedSchema(addCurriculumItemFormZod)
export type AddCurriculumItemFormValues = z.infer<typeof addCurriculumItemFormZod>

// Pet forms
const petFormZod = z.object({
  name: requiredStringSchema('Name'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'], {
    required_error: 'Please select a rarity',
  }),
})
export const petFormSchema = toTypedSchema(petFormZod)
export type PetFormValues = z.infer<typeof petFormZod>

// Announcement forms
const announcementFormZod = z.object({
  title: requiredStringSchema('Title'),
  content: z.string().min(1, 'Content is required'),
  targetAudience: z.enum(['all', 'students_only', 'parents_only'], {
    required_error: 'Please select target audience',
  }),
  expiresAt: z.string().optional().nullable(),
  isPinned: z.boolean().default(false),
})
export const announcementFormSchema = toTypedSchema(announcementFormZod)
export type AnnouncementFormValues = z.infer<typeof announcementFormZod>

// Contact form
const contactFormZod = z.object({
  name: nameSchema,
  email: emailSchema,
  subject: requiredStringSchema('Subject').max(200, 'Subject must be 200 characters or less'),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(5000, 'Message must be 5000 characters or less')
    .trim(),
})
export const contactFormSchema = toTypedSchema(contactFormZod)
export type ContactFormValues = z.infer<typeof contactFormZod>

// Contact form (in-app, authenticated — name/email from user profile)
const contactMessageZod = contactFormZod.pick({ subject: true, message: true })
export const contactMessageSchema = toTypedSchema(contactMessageZod)
export type ContactMessageValues = z.infer<typeof contactMessageZod>
