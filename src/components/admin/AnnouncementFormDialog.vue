<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import {
  useAnnouncementsStore,
  audienceConfig,
  type Announcement,
  type AnnouncementAudience,
} from '@/stores/announcements'
import { announcementFormSchema } from '@/lib/validations'
import { Loader2, ImagePlus, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
  announcement?: Announcement | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const announcementsStore = useAnnouncementsStore()

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: announcementFormSchema,
  initialValues: {
    title: '',
    content: '',
    targetAudience: 'all' as AnnouncementAudience,
    expiresAt: null as string | null,
    isPinned: false,
  },
})

const formImagePath = ref<string | null>(null)
const formImageFile = ref<File | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const isSaving = ref(false)
const showExpiryInput = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return

  if (props.announcement) {
    // Edit mode: populate form
    formImagePath.value = props.announcement.imagePath
    formImageFile.value = null
    showExpiryInput.value = !!props.announcement.expiresAt
    await nextTick()
    setValues({
      title: props.announcement.title,
      content: props.announcement.content,
      targetAudience: props.announcement.targetAudience,
      expiresAt: props.announcement.expiresAt,
      isPinned: props.announcement.isPinned,
    })
  } else {
    // Add mode: reset form
    resetForm()
    formImagePath.value = null
    formImageFile.value = null
    showExpiryInput.value = false
  }
})

function handleImageUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      formImageFile.value = file
      formImagePath.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

function removeImage() {
  formImagePath.value = null
  formImageFile.value = null
  if (imageInputRef.value) imageInputRef.value.value = ''
}

const handleSave = handleSubmit(async (values) => {
  isSaving.value = true

  try {
    let imagePath = formImagePath.value

    // Upload image if new file selected
    if (formImageFile.value) {
      const { path, error: uploadError } = await announcementsStore.uploadImage(formImageFile.value)
      if (uploadError) {
        toast.error(uploadError)
        return
      }
      imagePath = path
    }

    if (props.announcement) {
      // Update existing announcement
      const { error } = await announcementsStore.updateAnnouncement(props.announcement.id, {
        title: values.title,
        content: values.content,
        targetAudience: values.targetAudience,
        imagePath,
        expiresAt: values.expiresAt || null,
        isPinned: values.isPinned,
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Announcement updated successfully')
    } else {
      // Create new announcement
      const { error } = await announcementsStore.createAnnouncement({
        title: values.title,
        content: values.content,
        targetAudience: values.targetAudience,
        imagePath,
        expiresAt: values.expiresAt || null,
        isPinned: values.isPinned,
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Announcement created successfully')
    }

    open.value = false
    emit('saved')
  } finally {
    isSaving.value = false
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ announcement ? 'Edit Announcement' : 'New Announcement' }}</DialogTitle>
        <DialogDescription>
          {{
            announcement ? 'Update announcement details.' : 'Create a new announcement for users.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleSave">
        <!-- Title -->
        <VeeField v-slot="{ field, errors }" name="title">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="announcement-title"
              >Title <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="announcement-title"
              placeholder="Enter announcement title"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <!-- Content -->
        <VeeField v-slot="{ field, errors }" name="content">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="announcement-content"
              >Content <span class="text-destructive">*</span></FieldLabel
            >
            <Textarea
              id="announcement-content"
              placeholder="Enter announcement content..."
              rows="4"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <!-- Target Audience and Pin Row -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Target Audience -->
          <VeeField v-slot="{ handleChange, value, errors }" name="targetAudience">
            <Field :data-invalid="!!errors.length">
              <FieldLabel>Target Audience <span class="text-destructive">*</span></FieldLabel>
              <Select :model-value="value" :disabled="isSaving" @update:model-value="handleChange">
                <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="(config, audience) in audienceConfig"
                    :key="audience"
                    :value="audience"
                  >
                    <span :class="config.color">{{ config.label }}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldError :errors="errors" />
            </Field>
          </VeeField>

          <!-- Pin to Top -->
          <VeeField v-slot="{ handleChange, value }" name="isPinned">
            <Field>
              <FieldLabel>Pin to Top</FieldLabel>
              <Select
                :model-value="value ? 'yes' : 'no'"
                :disabled="isSaving"
                @update:model-value="(val) => handleChange(val === 'yes')"
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </VeeField>
        </div>

        <!-- Image Upload and Expiry Row -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Image Upload -->
          <div class="space-y-2">
            <FieldLabel>Image (Optional)</FieldLabel>
            <div v-if="formImagePath" class="relative inline-block">
              <img
                :src="formImageFile ? formImagePath : announcementsStore.getImageUrl(formImagePath)"
                alt="Announcement image preview"
                class="h-24 max-w-full rounded-lg border object-contain"
              />
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
                @change="handleImageUpload"
              />
              <Button
                type="button"
                variant="outline"
                class="w-full"
                :disabled="isSaving"
                @click="imageInputRef?.click()"
              >
                <ImagePlus class="mr-2 size-4" />
                Upload Image
              </Button>
            </div>
          </div>

          <!-- Expiry Date -->
          <VeeField v-slot="{ field, errors, setValue }" name="expiresAt">
            <Field :data-invalid="!!errors.length">
              <FieldLabel>Expires At (Optional)</FieldLabel>
              <div v-if="field.value || showExpiryInput" class="flex items-center gap-2">
                <Input
                  id="expires-at"
                  type="datetime-local"
                  :disabled="isSaving"
                  :aria-invalid="!!errors.length"
                  class="flex-1"
                  v-bind="field"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="size-8 shrink-0"
                  :disabled="isSaving"
                  @click="
                    () => {
                      setValue(null)
                      showExpiryInput = false
                    }
                  "
                >
                  <X class="size-4" />
                </Button>
              </div>
              <Button
                v-else
                type="button"
                variant="outline"
                class="w-full justify-start text-muted-foreground"
                :disabled="isSaving"
                @click="showExpiryInput = true"
              >
                No expiry date - click to set
              </Button>
              <FieldError :errors="errors" />
            </Field>
          </VeeField>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            Cancel
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ announcement ? 'Update' : 'Create' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
