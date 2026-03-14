<script setup lang="ts">
import { ref } from 'vue'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import { KeyRound, Loader2, ArrowLeft, CheckCircle } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()

useSeoMeta({
  title: 'Forgot Password',
  description: 'Reset your Clavis password. Enter your email to receive a password reset link.',
})

const isSubmitting = ref(false)
const emailSent = ref(false)
const sentEmail = ref('')

const forgotPasswordSchema = toTypedSchema(
  z.object({
    email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  }),
)

const { handleSubmit } = useForm({
  validationSchema: forgotPasswordSchema,
  initialValues: {
    email: '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true

  try {
    const result = await authStore.resetPassword(values.email)

    if (result.error) {
      toast.error(result.error)
      return
    }

    sentEmail.value = values.email
    emailSent.value = true
    toast.success('Password reset email sent!')
  } catch (err) {
    console.error('Failed to send password reset email:', err)
    toast.error('An unexpected error occurred')
  } finally {
    isSubmitting.value = false
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-primary">
          <KeyRound class="size-6 text-primary-foreground" />
        </div>
        <CardTitle class="text-2xl">Reset Password</CardTitle>
        <CardDescription>
          {{ emailSent ? 'Check your email' : 'Enter your email to receive a reset link' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Success State -->
        <div v-if="emailSent" class="space-y-4">
          <div class="flex flex-col items-center gap-4 py-4">
            <div
              class="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50"
            >
              <CheckCircle class="size-8 text-green-600" />
            </div>
            <div class="text-center">
              <p class="text-sm text-muted-foreground">We've sent a password reset link to</p>
              <p class="font-medium">{{ sentEmail }}</p>
            </div>
            <p class="text-center text-sm text-muted-foreground">
              Please check your inbox and click the link to reset your password. The link will
              expire in 1 hour.
            </p>
          </div>

          <Button as-child variant="outline" class="w-full">
            <RouterLink to="/login">
              <ArrowLeft class="mr-2 size-4" />
              Back to Login
            </RouterLink>
          </Button>
        </div>

        <!-- Form State -->
        <template v-else>
          <form class="space-y-4" @submit="onSubmit">
            <VeeField v-slot="{ field, errors }" name="email">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  :disabled="isSubmitting"
                  :aria-invalid="!!errors.length"
                  v-bind="field"
                />
                <FieldError :errors="errors" />
              </Field>
            </VeeField>

            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
              {{ isSubmitting ? 'Sending...' : 'Send Reset Link' }}
            </Button>
          </form>

          <div class="mt-4 text-center text-sm text-muted-foreground">
            Remember your password?
            <RouterLink to="/login" class="text-primary hover:underline">Back to Login</RouterLink>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
