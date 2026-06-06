<script setup lang="ts">
import { ref, toRef, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { usePasswordStrength } from '@/composables/usePasswordStrength'
import { useT } from '@/composables/useT'
import { z } from 'zod'
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
const t = useT()

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

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, t.value.auth.resetPassword.validation.passwordRequired)
      .min(8, t.value.auth.resetPassword.validation.passwordMinLength),
    confirmPassword: z
      .string()
      .min(1, t.value.auth.resetPassword.validation.confirmPasswordRequired),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: t.value.auth.resetPassword.validation.passwordsMismatch,
    path: ['confirmPassword'],
  })

const { handleSubmit, values, submitCount } = useForm({
  validationSchema: resetPasswordSchema,
  initialValues: {
    password: '',
    confirmPassword: '',
  },
})

const passwordRef = toRef(() => values.password ?? '')
const { strength: pwStrength, label: pwLabel, color: pwColor } = usePasswordStrength(passwordRef)

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
      tokenError.value = t.value.auth.resetPassword.invalidLinkError
      isValidToken.value = false
    } else {
      isValidToken.value = true
    }
  } catch (err) {
    console.error('Failed to verify reset token:', err)
    tokenError.value = t.value.auth.resetPassword.verifyError
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
    toast.success(t.value.auth.resetPassword.passwordUpdatedSuccess)

    // Sign out after password reset so user can log in fresh
    await authStore.signOut()
  } catch (err) {
    console.error('Failed to reset password:', err)
    toast.error(t.value.auth.resetPassword.unexpectedError)
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
        <div class="mb-1 flex items-center justify-center gap-3">
          <img :src="logoSvg" :alt="t.auth.common.logoAlt" class="size-10" />
          <span class="font-logo translate-y-1 text-3xl text-primary">Clavis</span>
        </div>
        <CardTitle class="text-xl">{{ t.auth.resetPassword.title }}</CardTitle>
        <CardDescription>
          {{
            passwordUpdated
              ? t.auth.resetPassword.descriptionSuccess
              : t.auth.resetPassword.descriptionForm
          }}
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
              <RouterLink to="/forgot-password">{{
                t.auth.resetPassword.requestNewLink
              }}</RouterLink>
            </Button>
            <Button as-child variant="outline" class="w-full">
              <RouterLink to="/login">
                <ArrowLeft class="mr-2 size-4" />
                {{ t.auth.resetPassword.backToLogin }}
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
              {{ t.auth.resetPassword.successMessage }}
            </p>
          </div>

          <Button class="w-full" @click="goToLogin">{{ t.auth.resetPassword.goToLogin }}</Button>
        </div>

        <!-- Form State -->
        <template v-else>
          <form class="space-y-4" @submit="onSubmit">
            <VeeField
              v-slot="{ field, errors }"
              :validate-on-blur="false"
              :validate-on-change="false"
              :validate-on-input="false"
              :validate-on-model-update="submitCount > 0"
              name="password"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="password">{{ t.auth.resetPassword.newPasswordLabel }}</FieldLabel>
                <PasswordInput
                  id="password"
                  :placeholder="t.auth.resetPassword.newPasswordPlaceholder"
                  :disabled="isSubmitting"
                  :aria-invalid="!!errors.length"
                  v-bind="field"
                />
                <div v-if="values.password" class="space-y-1">
                  <div class="flex gap-1">
                    <div
                      v-for="i in 4"
                      :key="i"
                      class="h-1 flex-1 rounded-full transition-colors"
                      :class="i <= pwStrength ? pwColor : 'bg-muted'"
                    />
                  </div>
                  <p class="text-xs text-muted-foreground">{{ pwLabel }}</p>
                </div>
                <FieldError :errors="errors" />
              </Field>
            </VeeField>

            <VeeField
              v-slot="{ field, errors }"
              :validate-on-blur="false"
              :validate-on-change="false"
              :validate-on-input="false"
              :validate-on-model-update="submitCount > 0"
              name="confirmPassword"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="confirmPassword">{{
                  t.auth.resetPassword.confirmPasswordLabel
                }}</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  :placeholder="t.auth.resetPassword.confirmPasswordPlaceholder"
                  :disabled="isSubmitting"
                  :aria-invalid="!!errors.length"
                  v-bind="field"
                />
                <FieldError :errors="errors" />
              </Field>
            </VeeField>

            <Button type="submit" class="mt-2 w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
              {{ isSubmitting ? t.auth.resetPassword.submitting : t.auth.resetPassword.submit }}
            </Button>
          </form>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
