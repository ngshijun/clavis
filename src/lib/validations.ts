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

export const signupFormSchema = z
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
export type SignupFormValues = z.infer<typeof signupFormSchema>

// Invitation forms
export const inviteEmailFormSchema = z.object({
  email: emailSchema,
})
export type InviteEmailFormValues = z.infer<typeof inviteEmailFormSchema>

// Profile forms
export const editNameFormSchema = z.object({
  name: nameSchema,
})
export type EditNameFormValues = z.infer<typeof editNameFormSchema>

// Question feedback form
export const questionFeedbackFormSchema = z.object({
  category: z.enum(
    ['question_error', 'image_error', 'option_error', 'answer_error', 'explanation_error', 'other'],
    {
      error: 'Please select an issue type',
    },
  ),
  details: z.string().optional(),
})
export type QuestionFeedbackFormValues = z.infer<typeof questionFeedbackFormSchema>

// Curriculum forms
export const addCurriculumItemFormSchema = z.object({
  name: requiredStringSchema('Name'),
})
export type AddCurriculumItemFormValues = z.infer<typeof addCurriculumItemFormSchema>

// Pet forms
export const petFormSchema = z.object({
  name: requiredStringSchema('Name'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'], {
    error: 'Please select a rarity',
  }),
})
export type PetFormValues = z.infer<typeof petFormSchema>

// Announcement forms
export const announcementFormSchema = z.object({
  title: requiredStringSchema('Title'),
  content: z.string().min(1, 'Content is required'),
  targetAudience: z.enum(['all', 'students_only', 'parents_only'], {
    error: 'Please select target audience',
  }),
  expiresAt: z.string().optional().nullable(),
  isPinned: z.boolean().default(false),
})
export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>

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
