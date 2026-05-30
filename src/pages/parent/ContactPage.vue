<script setup lang="ts">
import { ref, computed } from 'vue'
import { useT } from '@/composables/useT'
import { useForm, Field as VeeField } from 'vee-validate'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscription'
import { supabase } from '@/lib/supabaseClient'
import { contactMessageSchema } from '@/lib/validations'
import { Loader2, Send } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const subscriptionStore = useSubscriptionStore()

const isSubmitting = ref(false)
const t = useT()

// Children + their subscriptions are preloaded by parentRouteGuard (src/router/index.ts);
// this computed reads the resulting state reactively for the priority flag.
const isPriority = computed(() =>
  subscriptionStore.childSubscriptions.some((sub) => sub.tier !== 'core'),
)

const { handleSubmit, resetForm, submitCount } = useForm({
  validationSchema: contactMessageSchema,
  initialValues: {
    subject: '',
    message: '',
  },
})

const onSubmit = handleSubmit(async (formValues) => {
  isSubmitting.value = true
  try {
    const { error } = await supabase.functions.invoke('send-contact-email', {
      body: {
        name: authStore.user?.name ?? '',
        email: authStore.user?.email ?? '',
        ...formValues,
        source: 'app',
        priority: isPriority.value,
      },
    })
    if (error) throw error
    toast.success(t.value.parent.contact.toastSuccess)
    resetForm()
  } catch {
    toast.error(t.value.parent.contact.toastError)
  } finally {
    isSubmitting.value = false
  }
})
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t.parent.contact.title }}</h1>
      <p class="text-muted-foreground">{{ t.parent.contact.subtitle }}</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>{{ t.parent.contact.cardTitle }}</CardTitle>
        <CardDescription>{{ t.parent.contact.cardDescription }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit="onSubmit">
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
                {{ t.parent.contact.subjectLabel }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="contact-subject"
                type="text"
                :placeholder="t.parent.contact.subjectPlaceholder"
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
            name="message"
          >
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="contact-message">
                {{ t.parent.contact.messageLabel }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Textarea
                id="contact-message"
                :placeholder="t.parent.contact.messagePlaceholder"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                class="min-h-32"
                v-bind="field"
              />
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <Button type="submit" class="w-full" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" class="mr-2 size-4 animate-spin" />
            <Send v-else class="mr-2 size-4" />
            {{ isSubmitting ? t.parent.contact.sending : t.parent.contact.sendMessage }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
