<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { useCurriculumStore } from '@/stores/curriculum'
import { addCurriculumItemFormSchema } from '@/lib/validations'
import {
  type CurriculumLevel,
  type CurriculumIds,
  curriculumEntityConfig,
} from '@/lib/curriculumEntityConfig'
import { ImagePlus, Loader2, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  addType: CurriculumLevel
  gradeLevelId: string
  subjectId: string
  topicId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const curriculumStore = useCurriculumStore()
const config = computed(() => curriculumEntityConfig[props.addType])

const { handleSubmit, resetForm } = useForm({
  validationSchema: addCurriculumItemFormSchema,
  initialValues: { name: '' },
})

const isSaving = ref(false)
const imagePreview = ref('')
const imageFile = ref<File | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const dialogGradeLevelId = ref('')
const dialogSubjectId = ref('')
const dialogTopicId = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm()
      imagePreview.value = ''
      imageFile.value = null
      dialogGradeLevelId.value = props.gradeLevelId
      dialogSubjectId.value = props.subjectId
      dialogTopicId.value = props.topicId
    }
  },
)

function handleImageSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    imageFile.value = file
    const reader = new FileReader()
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

function removeImage() {
  imagePreview.value = ''
  imageFile.value = null
  if (imageInputRef.value) {
    imageInputRef.value.value = ''
  }
}

const handleAdd = handleSubmit(async (values) => {
  isSaving.value = true

  try {
    const ids: CurriculumIds = {
      gradeLevelId: dialogGradeLevelId.value,
      subjectId: dialogSubjectId.value,
      topicId: dialogTopicId.value,
      subTopicId: '',
    }

    const result = await config.value.add(curriculumStore, ids, values.name.trim())
    if (result.error) {
      toast.error(result.error)
      return
    }

    const itemId = result.id

    if (imageFile.value && itemId && config.value.imageType) {
      const uploadResult = await curriculumStore.uploadCurriculumImage(
        imageFile.value,
        config.value.imageType,
        itemId,
      )
      if (uploadResult.success && uploadResult.path) {
        const imageIds: CurriculumIds = { ...ids, [getItemIdKey()]: itemId }
        await config.value.updateCoverImage(curriculumStore, imageIds, uploadResult.path)
      }
    }

    toast.success(`${config.value.label} added successfully`)
    emit('update:open', false)
  } finally {
    isSaving.value = false
  }
})

function getItemIdKey(): keyof CurriculumIds {
  switch (props.addType) {
    case 'subject':
      return 'subjectId'
    case 'topic':
      return 'topicId'
    case 'subtopic':
      return 'subTopicId'
    default:
      return 'gradeLevelId'
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add {{ config.label }}</DialogTitle>
        <DialogDescription>{{ config.addDescription }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleAdd">
        <!-- Grade Level Select (for subject when not in context) -->
        <div v-if="addType === 'subject' && !dialogGradeLevelId" class="space-y-2">
          <FieldLabel>Grade Level</FieldLabel>
          <Select v-model="dialogGradeLevelId">
            <SelectTrigger>
              <SelectValue placeholder="Select a grade level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="grade in curriculumStore.gradeLevels"
                :key="grade.id"
                :value="grade.id"
              >
                {{ grade.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Subject Select (for topic when not in context) -->
        <div v-if="addType === 'topic' && dialogGradeLevelId && !dialogSubjectId" class="space-y-2">
          <FieldLabel>Subject</FieldLabel>
          <Select v-model="dialogSubjectId">
            <SelectTrigger>
              <SelectValue placeholder="Select a subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="subject in curriculumStore.gradeLevels.find(
                  (g) => g.id === dialogGradeLevelId,
                )?.subjects ?? []"
                :key="subject.id"
                :value="subject.id"
              >
                {{ subject.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Name Input -->
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel :for="addType + '-name'"
              >{{ config.inputLabel }} <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              :id="addType + '-name'"
              :placeholder="'Enter ' + config.inputLabel.toLowerCase()"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <!-- Cover Image (for subject/topic/subtopic) -->
        <div v-if="config.hasImage" class="space-y-2">
          <FieldLabel>Cover Image (optional)</FieldLabel>
          <div v-if="imagePreview" class="relative">
            <div class="aspect-video w-full overflow-hidden rounded-lg border">
              <img :src="imagePreview" alt="Cover image preview" class="size-full object-cover" />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              class="absolute -right-2 -top-2 size-6"
              :disabled="isSaving"
              @click="removeImage"
            >
              <X class="size-4" />
            </Button>
          </div>
          <div v-else>
            <input
              ref="imageInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleImageSelect"
            />
            <Button
              type="button"
              variant="outline"
              class="w-full"
              :disabled="isSaving"
              @click="imageInputRef?.click()"
            >
              <ImagePlus class="mr-2 size-4" />
              Add Cover Image
            </Button>
            <p class="mt-1 text-xs text-muted-foreground">Leave empty to use a default image.</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="isSaving"
            @click="emit('update:open', false)"
          >
            Cancel
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            Add
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
