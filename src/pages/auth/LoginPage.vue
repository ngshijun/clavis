<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { getDashboardPath } from '@/router'
import { loginFormSchema } from '@/lib/validations'
import { useT } from '@/composables/useT'
import logoSvg from '@/assets/logo.svg'
import { ArrowLeft, Loader2 } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, PasswordInput } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()
const t = useT()

useSeoMeta({
  title: 'Log In',
  description: 'Log in to Clavis to continue learning.',
  robots: 'noindex, follow',
})

const isSubmitting = ref(false)
const passwordRef = ref<InstanceType<typeof PasswordInput> | null>(null)

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
      toast.error(result.error)
      await nextTick()
      passwordRef.value?.inputRef?.select()
      return
    }

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
      </CardContent>
    </Card>
  </div>
</template>
