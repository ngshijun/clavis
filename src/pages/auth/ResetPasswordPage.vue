<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { z } from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import logoSvg from '@/assets/logo.svg'
import { Loader2, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()

useSeoMeta({
  title: 'Reset Password',
  description: 'Set a new password for your Clavis account.',
  robots: 'noindex, follow',
})

const isSubmitting = ref(false)
const isValidToken = ref(false)
const isLoading = ref(true)
const passwordUpdated = ref(false)
const tokenError = ref<string | null>(null)

const resetPasswordSchema = toTypedSchema(
  z
    .object({
      password: z
        .string()
        .min(1, 'Password is required')
        .min(6, 'Password must be at least 6 characters'),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }),
)

const { handleSubmit } = useForm({
  validationSchema: resetPasswordSchema,
  initialValues: {
    password: '',
    confirmPassword: '',
  },
})

onMounted(async () => {
  // Check if we have a valid recovery session from the URL hash
  // Supabase redirects with hash params like #access_token=xxx&type=recovery
  try {
    const hash = window.location.hash

    // If no hash with recovery type, redirect to forgot-password
    if (!hash || !hash.includes('type=recovery')) {
      const session = await authStore.getSession()
      // Only allow if there's an existing session (user already authenticated via reset link)
      if (!session) {
        router.replace('/forgot-password')
        return
      }
      isValidToken.value = true
      isLoading.value = false
      return
    }

    // Has recovery hash - let Supabase process it
    const session = await authStore.getSession()

    if (!session) {
      tokenError.value = 'Invalid or expired reset link. Please request a new one.'
      isValidToken.value = false
    } else if (session) {
      isValidToken.value = true
    } else {
      tokenError.value = 'Invalid or expired reset link. Please request a new one.'
      isValidToken.value = false
    }
  } catch (err) {
    console.error('Failed to verify reset token:', err)
    tokenError.value = 'An error occurred. Please try again.'
    isValidToken.value = false
  } finally {
    isLoading.value = false
  }
})

const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true

  try {
    const result = await authStore.updatePassword(values.password)

    if (result.error) {
      toast.error(result.error)
      return
    }

    passwordUpdated.value = true
    toast.success('Password updated successfully!')

    // Sign out after password reset so user can log in fresh
    await authStore.signOut()
  } catch (err) {
    console.error('Failed to reset password:', err)
    toast.error('An unexpected error occurred')
  } finally {
    isSubmitting.value = false
  }
})

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="flex items-center justify-center gap-3">
          <img :src="logoSvg" alt="Clavis logo" class="size-8" />
          <CardTitle class="text-2xl">
            {{ passwordUpdated ? 'Password Updated' : 'Set New Password' }}
          </CardTitle>
        </div>
        <CardDescription>
          {{ passwordUpdated ? 'Your password has been reset' : 'Enter your new password below' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="size-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Invalid Token State -->
        <div v-else-if="!isValidToken" class="space-y-4">
          <Alert variant="destructive">
            <AlertCircle class="size-4" />
            <AlertDescription>
              {{ tokenError }}
            </AlertDescription>
          </Alert>

          <div class="flex flex-col gap-2">
            <Button as-child class="w-full">
              <RouterLink to="/forgot-password">Request New Reset Link</RouterLink>
            </Button>
            <Button as-child variant="outline" class="w-full">
              <RouterLink to="/login">
                <ArrowLeft class="mr-2 size-4" />
                Back to Login
              </RouterLink>
            </Button>
          </div>
        </div>

        <!-- Success State -->
        <div v-else-if="passwordUpdated" class="space-y-4">
          <div class="flex flex-col items-center gap-4 py-4">
            <div
              class="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50"
            >
              <CheckCircle class="size-8 text-green-600" />
            </div>
            <p class="text-center text-sm text-muted-foreground">
              Your password has been updated successfully. You can now log in with your new
              password.
            </p>
          </div>

          <Button class="w-full" @click="goToLogin">Go to Login</Button>
        </div>

        <!-- Form State -->
        <template v-else>
          <form class="space-y-4" @submit="onSubmit">
            <VeeField v-slot="{ field, errors }" name="password">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="password">New Password</FieldLabel>
                <PasswordInput
                  id="password"
                  placeholder="Enter your new password"
                  :disabled="isSubmitting"
                  :aria-invalid="!!errors.length"
                  v-bind="field"
                />
                <FieldError :errors="errors" />
              </Field>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="confirmPassword">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="confirmPassword">Confirm Password</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Confirm your new password"
                  :disabled="isSubmitting"
                  :aria-invalid="!!errors.length"
                  v-bind="field"
                />
                <FieldError :errors="errors" />
              </Field>
            </VeeField>

            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
              {{ isSubmitting ? 'Updating...' : 'Update Password' }}
            </Button>
          </form>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
