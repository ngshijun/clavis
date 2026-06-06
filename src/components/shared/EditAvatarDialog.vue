<script setup lang="ts">
import { ref, watch } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, ImagePlus, Dices } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()

const MAX_FILE_SIZE_MB = 1
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

defineProps<{
  currentAvatarUrl: string
  userInitials: string
  isSaving: boolean
}>()

const emit = defineEmits<{
  save: [payload: { file: File | null; previewUrl: string }]
}>()

const open = defineModel<boolean>('open', { required: true })

const avatarPreviewUrl = ref('')
const avatarFile = ref<File | null>(null)
const avatarInputRef = ref<HTMLInputElement | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    avatarPreviewUrl.value = ''
    avatarFile.value = null
  }
})

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (file.size > MAX_FILE_SIZE_BYTES) {
    toast.error(t.value.shared.editAvatarDialog.fileTooLarge(MAX_FILE_SIZE_MB))
    target.value = ''
    return
  }

  avatarFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    avatarPreviewUrl.value = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // Clear the input value so picking the exact same file again still fires @change
  target.value = ''
}

function generateRandom() {
  const seed = Math.random().toString(36).substring(7)
  avatarPreviewUrl.value = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
  avatarFile.value = null
}

function handleSave() {
  emit('save', { file: avatarFile.value, previewUrl: avatarPreviewUrl.value })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.shared.editAvatarDialog.title }}</DialogTitle>
        <DialogDescription> {{ t.shared.editAvatarDialog.description }} </DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="flex justify-center">
          <Avatar class="size-24">
            <AvatarImage :src="avatarPreviewUrl || currentAvatarUrl" alt="Preview" />
            <AvatarFallback class="text-2xl">{{ userInitials }}</AvatarFallback>
          </Avatar>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />
          <Button
            variant="outline"
            class="w-full"
            :disabled="isSaving"
            @click="avatarInputRef?.click()"
          >
            <ImagePlus class="mr-2 size-4" />
            {{ t.shared.editAvatarDialog.uploadImage }}
          </Button>
          <Button variant="outline" class="w-full" :disabled="isSaving" @click="generateRandom">
            <Dices class="mr-2 size-4" />
            {{ t.shared.editAvatarDialog.randomAvatar }}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.shared.editAvatarDialog.cancel }}
        </Button>
        <Button :disabled="isSaving || !avatarPreviewUrl" @click="handleSave">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ t.shared.editAvatarDialog.save }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
