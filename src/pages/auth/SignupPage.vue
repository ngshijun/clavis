<script setup lang="ts">
import { ref, shallowRef, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSeoMeta } from '@unhead/vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { signupFormSchema } from '@/lib/validations'
import logoSvg from '@/assets/logo.svg'
import { ArrowLeft, Loader2, CalendarIcon } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, PasswordInput } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { toast } from 'vue-sonner'
import { type DateValue, getLocalTimeZone, today } from '@internationalized/date'
import { createYearRange } from 'reka-ui/date'

const router = useRouter()
const authStore = useAuthStore()

useSeoMeta({
  title: 'Sign Up',
  description:
    'Create a free Clavis account. Gamified practice sessions, collectible pets, and progress tracking for primary school students.',
  robots: 'noindex, follow',
})

const isSubmitting = ref(false)
const dateOfBirthValue = shallowRef<DateValue | undefined>(undefined)

// Max date for birthday (today)
const maxBirthdayDate = computed(() => today(getLocalTimeZone()))

// Year range for birthday picker (last 25 years, newest first)
const birthdayYearRange = computed(() => {
  const now = today(getLocalTimeZone())
  return createYearRange({
    start: now.cycle('year', -100),
    end: now,
  }).reverse()
})

const { handleSubmit, values, setFieldValue, submitCount } = useForm({
  validationSchema: signupFormSchema,
  initialValues: {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    userType: 'student' as 'student' | 'parent',
    dateOfBirth: '',
  },
})

const onSubmit = handleSubmit(async (formValues) => {
  isSubmitting.value = true

  try {
    const result = await authStore.signUp(
      formValues.email,
      formValues.password,
      formValues.name,
      formValues.userType,
      formValues.dateOfBirth || undefined,
    )

    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.user) {
      router.push({ path: '/signup/confirm', query: { email: formValues.email } })
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
        <div class="flex items-center justify-center gap-3">
          <img :src="logoSvg" alt="Clavis logo" class="size-8" />
          <CardTitle class="text-2xl">Clavis</CardTitle>
        </div>
        <CardDescription>Create a new account</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit="onSubmit">
          <VeeField
            v-slot="{ field, errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="name"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="name">Name <span class="text-destructive">*</span></FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="Enter your name"
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
            name="email"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="email">Email <span class="text-destructive">*</span></FieldLabel>
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
              <FieldLabel for="password">
                Password <span class="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="password"
                placeholder="Create a password (min 6 characters)"
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
            name="confirmPassword"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="confirmPassword">
                Confirm Password <span class="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm your password"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <VeeField
            v-slot="{ errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="userType"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel>Account Type <span class="text-destructive">*</span></FieldLabel>
              <div class="flex gap-2">
                <Button
                  type="button"
                  :variant="values.userType === 'student' ? 'default' : 'outline'"
                  size="sm"
                  class="flex-1"
                  :disabled="isSubmitting"
                  @click="setFieldValue('userType', 'student')"
                >
                  Student
                </Button>
                <Button
                  type="button"
                  :variant="values.userType === 'parent' ? 'default' : 'outline'"
                  size="sm"
                  class="flex-1"
                  :disabled="isSubmitting"
                  @click="setFieldValue('userType', 'parent')"
                >
                  Parent
                </Button>
              </div>
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <VeeField
            v-slot="{ handleChange }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="dateOfBirth"
          >
            <Field>
              <FieldLabel>Date of Birth</FieldLabel>
              <Popover>
                <PopoverTrigger as-child>
                  <Button
                    variant="outline"
                    class="w-full justify-start text-left font-normal"
                    :class="{ 'text-muted-foreground': !dateOfBirthValue }"
                    :disabled="isSubmitting"
                  >
                    <CalendarIcon class="mr-2 size-4" />
                    <span v-if="dateOfBirthValue">
                      {{
                        new Date(dateOfBirthValue.toString()).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      }}
                    </span>
                    <span v-else>Pick a date</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <Calendar
                    :model-value="dateOfBirthValue"
                    :max-value="maxBirthdayDate"
                    :year-range="birthdayYearRange"
                    layout="month-and-year"
                    initial-focus
                    @update:model-value="
                      (v) => {
                        dateOfBirthValue = v as DateValue | undefined
                        handleChange(v?.toString() ?? '')
                      }
                    "
                  />
                </PopoverContent>
              </Popover>
            </Field>
          </VeeField>

          <Button type="submit" class="w-full" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            {{ isSubmitting ? 'Creating Account...' : 'Sign Up' }}
          </Button>
        </form>

        <div class="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?
          <RouterLink to="/login" class="text-primary hover:underline">Login</RouterLink>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
