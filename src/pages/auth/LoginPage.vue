<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { getDashboardPath } from '@/router'
import { loginFormSchema } from '@/lib/validations'
import { useT } from '@/composables/useT'
import logoSvg from '@/assets/logo.svg'
import { ArrowLeft, Loader2, Mail } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input, PasswordInput } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()
const t = useT()

useSeoMeta({
  title: 'Log In',
  description: 'Log in to Clavis to start your gamified learning journey.',
  robots: 'noindex, follow',
})

const isSubmitting = ref(false)
const passwordRef = ref<InstanceType<typeof PasswordInput> | null>(null)
const unconfirmedEmail = ref('')
const isResending = ref(false)
const cooldownSeconds = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
  }
})

function startCooldown() {
  cooldownSeconds.value = 60
  cooldownTimer = setInterval(() => {
    cooldownSeconds.value--
    if (cooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer!)
      cooldownTimer = null
    }
  }, 1000)
}

async function handleResendVerification() {
  isResending.value = true
  try {
    const result = await authStore.resendConfirmationEmail(unconfirmedEmail.value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t.value.auth.login.resendSuccess)
    startCooldown()
  } catch {
    toast.error(t.value.auth.login.unexpectedError)
  } finally {
    isResending.value = false
  }
}

const { handleSubmit, submitCount } = useForm({
  validationSchema: loginFormSchema,
  initialValues: {
    email: '',
    password: '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true

  try {
    const result = await authStore.signIn(values.email, values.password)

    if (result.error) {
      if (result.errorCode === 'email_not_confirmed') {
        unconfirmedEmail.value = values.email
      } else {
        toast.error(result.error)
      }
      await nextTick()
      passwordRef.value?.inputRef?.select()
      return
    }

    // Clear any previous unconfirmed state on successful login
    unconfirmedEmail.value = ''

    if (result.user) {
      toast.success(t.value.auth.login.welcomeBack)
      // Reuse the router's single role->path mapping to avoid drift
      router.push(getDashboardPath(authStore.userType))
    }
  } catch {
    toast.error(t.value.auth.login.unexpectedError)
  } finally {
    isSubmitting.value = false
  }
})
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center bg-background p-4">
    <Button as-child variant="ghost" size="sm" class="absolute left-4 top-4">
      <RouterLink to="/">
        <ArrowLeft class="mr-2 size-4" />
        {{ t.auth.common.backToHome }}
      </RouterLink>
    </Button>
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="mb-1 flex items-center justify-center gap-3">
          <img :src="logoSvg" :alt="t.auth.common.logoAlt" class="size-10" />
          <span class="font-logo translate-y-1 text-3xl text-primary">Clavis</span>
        </div>
        <CardTitle class="text-xl">{{ t.auth.login.title }}</CardTitle>
        <CardDescription>{{ t.auth.login.description }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert v-if="unconfirmedEmail" variant="default" class="mb-4">
          <Mail class="size-4" />
          <AlertDescription class="flex flex-col gap-2">
            <span>{{ t.auth.login.unconfirmedEmail }}</span>
            <Button
              variant="outline"
              size="sm"
              class="w-fit"
              :disabled="isResending || cooldownSeconds > 0"
              @click="handleResendVerification"
            >
              <Loader2 v-if="isResending" class="mr-2 size-4 animate-spin" />
              <template v-if="isResending">{{ t.auth.login.resendingSending }}</template>
              <template v-else-if="cooldownSeconds > 0">{{
                t.auth.login.resendCooldown(cooldownSeconds)
              }}</template>
              <template v-else>{{ t.auth.login.resendVerification }}</template>
            </Button>
          </AlertDescription>
        </Alert>

        <form class="space-y-4" @submit="onSubmit">
          <VeeField
            v-slot="{ field, errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="email"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="email">{{ t.auth.login.emailLabel }}</FieldLabel>
              <Input
                id="email"
                type="email"
                :placeholder="t.auth.login.emailPlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <VeeField
            v-slot="{ field, errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="password"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="password">{{ t.auth.login.passwordLabel }}</FieldLabel>
              <PasswordInput
                id="password"
                ref="passwordRef"
                :placeholder="t.auth.login.passwordPlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <div class="text-right">
            <RouterLink to="/forgot-password" class="text-sm text-primary hover:underline">
              {{ t.auth.login.forgotPassword }}
            </RouterLink>
          </div>

          <Button type="submit" class="mt-2 w-full" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ isSubmitting ? t.auth.login.submitting : t.auth.login.submit }}
          </Button>
        </form>

        <div class="mt-4 text-center text-sm text-muted-foreground">
          {{ t.auth.login.noAccount }}
          <RouterLink to="/signup" class="text-primary hover:underline">{{
            t.auth.login.signUp
          }}</RouterLink>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
