<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { loginFormSchema } from '@/lib/validations'
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, PasswordInput } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()

useSeoMeta({
  title: 'Log In',
  description: 'Log in to Clavis to start your gamified learning journey.',
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
      toast.success('Welcome back!')
      // Redirect based on user type
      const userType = authStore.userType
      if (userType === 'admin') {
        router.push('/admin/dashboard')
      } else if (userType === 'student') {
        router.push('/student/dashboard')
      } else if (userType === 'parent') {
        router.push('/parent/dashboard')
      } else {
        router.push('/login')
      }
    }
  } catch (err) {
    toast.error('An unexpected error occurred')
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
        Back to Home
      </RouterLink>
    </Button>
    <Card class="w-full max-w-md">
      <CardHeader class="text-center">
        <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-primary">
          <KeyRound class="size-6 text-primary-foreground" />
        </div>
        <CardTitle class="text-2xl">Clavis</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
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

          <VeeField
            v-slot="{ field, errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="password"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="password">Password</FieldLabel>
              <PasswordInput
                id="password"
                ref="passwordRef"
                placeholder="Enter your password"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <div class="text-right">
            <RouterLink to="/forgot-password" class="text-sm text-primary hover:underline">
              Forgot password?
            </RouterLink>
          </div>

          <Button type="submit" class="w-full" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ isSubmitting ? 'Signing in...' : 'Login' }}
          </Button>
        </form>

        <div class="mt-4 text-center text-sm text-muted-foreground">
          Don't have an account?
          <RouterLink to="/signup" class="text-primary hover:underline">Sign up</RouterLink>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
