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
const loginFormZod = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export const loginFormSchema = loginFormZod
export type LoginFormValues = z.infer<typeof loginFormZod>

const signupFormZod = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    userType: z.enum(['student', 'parent'], {
      error: 'Please select a user type',
    }),
    dateOfBirth: z.string().optional(),
    schoolId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.userType !== 'student' || !!data.schoolId, {
    message: 'Please select a school',
    path: ['schoolId'],
  })
export const signupFormSchema = signupFormZod
export type SignupFormValues = z.infer<typeof signupFormZod>

// Invitation forms
const inviteEmailFormZod = z.object({
  email: emailSchema,
})
export const inviteEmailFormSchema = inviteEmailFormZod
export type InviteEmailFormValues = z.infer<typeof inviteEmailFormZod>

// Profile forms
const editNameFormZod = z.object({
  name: nameSchema,
})
export const editNameFormSchema = editNameFormZod
export type EditNameFormValues = z.infer<typeof editNameFormZod>

// Question feedback form
const questionFeedbackFormZod = z.object({
  category: z.enum(
    ['question_error', 'image_error', 'option_error', 'answer_error', 'explanation_error', 'other'],
    {
      error: 'Please select an issue type',
    },
  ),
  details: z.string().optional(),
})
export const questionFeedbackFormSchema = questionFeedbackFormZod
export type QuestionFeedbackFormValues = z.infer<typeof questionFeedbackFormZod>

// Curriculum forms
const addCurriculumItemFormZod = z.object({
  name: requiredStringSchema('Name'),
})
export const addCurriculumItemFormSchema = addCurriculumItemFormZod
export type AddCurriculumItemFormValues = z.infer<typeof addCurriculumItemFormZod>

// Pet forms
const petFormZod = z.object({
  name: requiredStringSchema('Name'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'], {
    error: 'Please select a rarity',
  }),
})
export const petFormSchema = petFormZod
export type PetFormValues = z.infer<typeof petFormZod>

// Announcement forms
const announcementFormZod = z.object({
  title: requiredStringSchema('Title'),
  content: z.string().min(1, 'Content is required'),
  targetAudience: z.enum(['all', 'students_only', 'parents_only'], {
    error: 'Please select target audience',
  }),
  expiresAt: z.string().optional().nullable(),
  isPinned: z.boolean().default(false),
})
export const announcementFormSchema = announcementFormZod
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
export const contactFormSchema = contactFormZod
export type ContactFormValues = z.infer<typeof contactFormZod>

// Contact form (in-app, authenticated — name/email from user profile)
const contactMessageZod = contactFormZod.pick({ subject: true, message: true })
export const contactMessageSchema = contactMessageZod
export type ContactMessageValues = z.infer<typeof contactMessageZod>
