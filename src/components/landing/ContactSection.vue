<script setup lang="ts">
import { ref } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'
import { useContact } from '@/composables/useContact'
import { contactFormSchema } from '@/lib/validations'
import { Loader2, Send } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { toast } from 'vue-sonner'

const { t } = storeToRefs(useLanguageStore())

const honeypot = ref('')
const { isSubmitting, sendContactMessage } = useContact()

const { handleSubmit, resetForm, submitCount } = useForm({
  validationSchema: contactFormSchema,
  initialValues: { name: '', email: '', subject: '', message: '' },
})

const onSubmit = handleSubmit(async (formValues) => {
  if (honeypot.value) return // bot detected

  const { error } = await sendContactMessage({ ...formValues, source: 'landing' })
  if (error) {
    toast.error(t.value.landing.contact.errorMessage)
    return
  }
  toast.success(t.value.landing.contact.successMessage)
  resetForm()
})
</script>

<template>
  <section class="border-t bg-landing-band-alt py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">
          {{ t.landing.contact.title }}
        </h2>
        <p class="text-lg text-muted-foreground">
          {{ t.landing.contact.subtitle }}
        </p>
      </div>

      <div class="mx-auto max-w-lg">
        <form class="space-y-4" @submit="onSubmit">
          <!-- Honeypot field -->
          <div class="absolute -z-10 opacity-0" aria-hidden="true">
            <input name="website" type="text" tabindex="-1" autocomplete="off" v-model="honeypot" />
          </div>

          <VeeField
            v-slot="{ field, errors }"
            :validate-on-blur="false"
            :validate-on-change="false"
            :validate-on-input="false"
            :validate-on-model-update="submitCount > 0"
            name="name"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="contact-name">
                {{ t.landing.contact.name }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="contact-name"
                type="text"
                :placeholder="t.landing.contact.namePlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                class="bg-landing-band dark:bg-landing-band"
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
              <FieldLabel for="contact-email">
                {{ t.landing.contact.email }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="contact-email"
                type="email"
                :placeholder="t.landing.contact.emailPlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                class="bg-landing-band dark:bg-landing-band"
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
            name="subject"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="contact-subject">
                {{ t.landing.contact.subject }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="contact-subject"
                type="text"
                :placeholder="t.landing.contact.subjectPlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                class="bg-landing-band dark:bg-landing-band"
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
            name="message"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="contact-message">
                {{ t.landing.contact.message }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Textarea
                id="contact-message"
                :placeholder="t.landing.contact.messagePlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                class="min-h-32 bg-landing-band dark:bg-landing-band"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <Button type="submit" class="w-full" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            <Send v-else class="mr-2 size-4" />
            {{ isSubmitting ? t.landing.contact.submitting : t.landing.contact.submit }}
          </Button>
        </form>
      </div>
    </div>
  </section>
</template>
