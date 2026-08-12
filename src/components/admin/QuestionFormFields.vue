<script setup lang="ts">
import { Field as VeeField } from 'vee-validate'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'
import type { useQuestionForm } from '@/composables/useQuestionForm'
import { ImagePlus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const t = useT()
const languageStore = useLanguageStore()

const props = withDefaults(
  defineProps<{
    form: ReturnType<typeof useQuestionForm>
    optionImageUrlGetter?: (optionId: 'a' | 'b' | 'c' | 'd') => string
  }>(),
  {
    optionImageUrlGetter: undefined,
  },
)

// Shorthand accessors to avoid verbose .value throughout template
const f = props.form

function getOptionImageSrc(option: { id: string; imagePath: string | null }): string {
  if (props.optionImageUrlGetter) {
    return props.optionImageUrlGetter(option.id as 'a' | 'b' | 'c' | 'd')
  }
  return option.imagePath ?? ''
}
</script>

<template>
  <!-- Question Type -->
  <VeeField v-slot="{ handleChange, value }" name="type">
    <Field>
      <FieldLabel>
        {{ t.shared.questionFormFields.questionTypeLabel }}
        <span class="text-destructive">*</span>
      </FieldLabel>
      <Select
        :key="languageStore.language"
        :model-value="value"
        :disabled="f.isSaving.value"
        @update:model-value="handleChange"
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mcq">{{
            t.shared.questionFormFields.multipleChoiceSingle
          }}</SelectItem>
          <SelectItem value="mrq">{{
            t.shared.questionFormFields.multipleResponseMultiple
          }}</SelectItem>
          <SelectItem value="short_answer">{{
            t.shared.questionFormFields.shortAnswerType
          }}</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </VeeField>

  <!-- Question -->
  <VeeField v-slot="{ value, handleChange, handleBlur, errors: fieldErrors }" name="question">
    <Field :data-invalid="!!fieldErrors.length">
      <FieldLabel>
        {{ t.shared.questionFormFields.questionLabel }} <span class="text-destructive">*</span>
      </FieldLabel>
      <Textarea
        :model-value="value"
        @update:model-value="handleChange"
        @blur="handleBlur"
        :placeholder="t.shared.questionFormFields.questionPlaceholder"
        rows="3"
        :disabled="f.isSaving.value"
        :aria-invalid="!!fieldErrors.length"
        :class="{ 'border-destructive': !!fieldErrors.length }"
      />
      <FieldError :errors="fieldErrors" />
    </Field>
  </VeeField>

  <!-- Question Image -->
  <Field>
    <FieldLabel>{{ t.shared.questionFormFields.questionImageLabel }}</FieldLabel>
    <div v-if="f.questionImage.value.displayUrl" class="relative inline-block">
      <img
        :src="f.questionImage.value.displayUrl"
        alt="Question image"
        class="max-h-48 rounded-lg border object-contain"
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        class="absolute -right-2 -top-2 size-6"
        :disabled="f.isSaving.value"
        @click="f.removeImage"
      >
        <X class="size-4" />
      </Button>
    </div>
    <div v-else>
      <input
        :ref="(el) => (f.imageInputRef.value = el as HTMLInputElement)"
        type="file"
        accept="image/*"
        class="hidden"
        @change="f.handleImageUpload"
      />
      <Button
        type="button"
        variant="outline"
        class="w-full"
        :disabled="f.isSaving.value"
        @click="f.imageInputRef.value?.click()"
      >
        <ImagePlus class="mr-2 size-4" />
        {{ t.shared.questionFormFields.addImage }}
      </Button>
    </div>
  </Field>

  <!-- MCQ/MRQ Options -->
  <div v-if="f.values.type === 'mcq' || f.values.type === 'mrq'" class="space-y-3">
    <Field :data-invalid="!!f.errors.value.options">
      <FieldLabel>
        {{ t.shared.questionFormFields.optionsLabel }} <span class="text-destructive">*</span>
        <span class="ml-1 text-xs font-normal text-muted-foreground">
          ({{
            f.values.type === 'mcq'
              ? t.shared.questionFormFields.mcqHint
              : t.shared.questionFormFields.mrqHint
          }})
        </span>
      </FieldLabel>
      <p class="text-xs text-muted-foreground">
        {{ t.shared.questionFormFields.optionsDesc }}
        {{ f.values.type === 'mrq' ? t.shared.questionFormFields.mrqToggleHint : '' }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ t.shared.questionFormFields.tipsHint }}
      </p>
      <FieldError
        v-if="f.errors.value.options"
        :errors="[
          f.errors.value.options === 'At least 2 options must have text or an image'
            ? t.shared.questionFormFields.optionValidation
            : f.errors.value.options,
        ]"
      />
    </Field>

    <div v-for="option in f.values.options" :key="option.id" class="space-y-2">
      <div class="flex items-start gap-2">
        <Button
          type="button"
          :variant="option.isCorrect ? 'default' : 'outline'"
          size="sm"
          class="mt-1 w-8 shrink-0"
          :disabled="f.isSaving.value"
          @click="
            f.values.type === 'mcq'
              ? f.setCorrectOption(option.id)
              : f.toggleCorrectOption(option.id)
          "
        >
          {{ option.id.toUpperCase() }}
        </Button>
        <div class="flex-1 space-y-2">
          <Input
            :model-value="option.text ?? ''"
            :placeholder="t.shared.questionFormFields.optionPlaceholder(option.id.toUpperCase())"
            :disabled="f.isSaving.value"
            @update:model-value="f.updateOptionText(option.id, $event as string)"
          />
          <div v-if="option.imagePath" class="relative inline-block">
            <img
              :src="getOptionImageSrc(option)"
              :alt="`Option ${option.id.toUpperCase()} image`"
              class="max-h-24 rounded border object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              class="absolute -right-2 -top-2 size-5"
              :disabled="f.isSaving.value"
              @click="f.removeOptionImage(option.id)"
            >
              <X class="size-3" />
            </Button>
          </div>
          <div v-else class="flex gap-2">
            <input
              :ref="(el) => (f.optionImageInputRefs.value[option.id] = el as HTMLInputElement)"
              type="file"
              accept="image/*"
              class="hidden"
              @change="f.handleOptionImageUpload($event, option.id)"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              :disabled="f.isSaving.value"
              @click="f.optionImageInputRefs.value[option.id]?.click()"
            >
              <ImagePlus class="mr-1 size-3" />
              {{ t.shared.questionFormFields.addImage }}
            </Button>
          </div>
          <!-- Per-option tip: shown to a student who picks THIS option and gets it wrong -->
          <Textarea
            :model-value="option.tip ?? ''"
            :placeholder="t.shared.questionFormFields.tipPlaceholder(option.id.toUpperCase())"
            rows="2"
            :disabled="f.isSaving.value"
            @update:model-value="f.updateOptionTip(option.id, $event as string)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Short Answer -->
  <VeeField
    v-else-if="f.values.type === 'short_answer'"
    v-slot="{ value, handleChange, handleBlur, errors: fieldErrors }"
    name="answer"
  >
    <Field :data-invalid="!!fieldErrors.length">
      <FieldLabel>
        {{ t.shared.questionFormFields.answerLabel }} <span class="text-destructive">*</span>
      </FieldLabel>
      <Input
        :model-value="value"
        @update:model-value="handleChange"
        @blur="handleBlur"
        :placeholder="t.shared.questionFormFields.answerPlaceholder"
        :disabled="f.isSaving.value"
        :aria-invalid="!!fieldErrors.length"
        :class="{ 'border-destructive': !!fieldErrors.length }"
      />
      <FieldError :errors="fieldErrors" />
    </Field>
  </VeeField>
</template>
