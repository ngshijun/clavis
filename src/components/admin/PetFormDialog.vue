<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useForm, Field as VeeField } from 'vee-validate'
import { usePetsStore, rarityConfig, type Pet, type PetRarity } from '@/stores/pets'
import { useAdminPetsStore } from '@/stores/admin-pets'
import { petFormSchema } from '@/lib/validations'
import { Loader2, ImagePlus, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  pet: Pet | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const petsStore = usePetsStore()
const adminPetsStore = useAdminPetsStore()

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: petFormSchema,
  initialValues: {
    name: '',
    rarity: 'common' as PetRarity,
  },
})

const formImagePath = ref('')
const formImageFile = ref<File | null>(null)
const formTier2ImagePath = ref<string | null>(null)
const formTier2ImageFile = ref<File | null>(null)
const formTier3ImagePath = ref<string | null>(null)
const formTier3ImageFile = ref<File | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const tier2ImageInputRef = ref<HTMLInputElement | null>(null)
const tier3ImageInputRef = ref<HTMLInputElement | null>(null)
const isSaving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return

  formImageFile.value = null
  formTier2ImageFile.value = null
  formTier3ImageFile.value = null

  if (props.pet) {
    formImagePath.value = props.pet.imagePath
    formTier2ImagePath.value = props.pet.tier2ImagePath
    formTier3ImagePath.value = props.pet.tier3ImagePath
    await nextTick()
    setValues({ name: props.pet.name, rarity: props.pet.rarity })
  } else {
    resetForm()
    formImagePath.value = ''
    formTier2ImagePath.value = null
    formTier3ImagePath.value = null
  }
})

function handleImageUpload(event: Event, tier: 1 | 2 | 3 = 1) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (tier === 1) {
        formImageFile.value = file
        formImagePath.value = result
      } else if (tier === 2) {
        formTier2ImageFile.value = file
        formTier2ImagePath.value = result
      } else {
        formTier3ImageFile.value = file
        formTier3ImagePath.value = result
      }
    }
    reader.readAsDataURL(file)
  }
}

function removeImage(tier: 1 | 2 | 3 = 1) {
  if (tier === 1) {
    formImagePath.value = ''
    formImageFile.value = null
    if (imageInputRef.value) imageInputRef.value.value = ''
  } else if (tier === 2) {
    formTier2ImagePath.value = null
    formTier2ImageFile.value = null
    if (tier2ImageInputRef.value) tier2ImageInputRef.value.value = ''
  } else {
    formTier3ImagePath.value = null
    formTier3ImageFile.value = null
    if (tier3ImageInputRef.value) tier3ImageInputRef.value.value = ''
  }
}

const handleSave = handleSubmit(async (values) => {
  isSaving.value = true

  try {
    let imagePath = formImagePath.value
    let tier2ImagePath = formTier2ImagePath.value
    let tier3ImagePath = formTier3ImagePath.value

    // Upload tier 1 image if new file selected
    if (formImageFile.value) {
      const { path, error: uploadError } = await adminPetsStore.uploadPetImage(
        formImageFile.value,
        props.pet?.imagePath,
      )
      if (uploadError) {
        toast.error(uploadError)
        return
      }
      imagePath = path || ''
    }

    // Upload tier 2 image if new file selected
    if (formTier2ImageFile.value) {
      const { path, error: uploadError } = await adminPetsStore.uploadPetImage(
        formTier2ImageFile.value,
        props.pet?.tier2ImagePath,
      )
      if (uploadError) {
        toast.error(uploadError)
        return
      }
      tier2ImagePath = path || null
    }

    // Upload tier 3 image if new file selected
    if (formTier3ImageFile.value) {
      const { path, error: uploadError } = await adminPetsStore.uploadPetImage(
        formTier3ImageFile.value,
        props.pet?.tier3ImagePath,
      )
      if (uploadError) {
        toast.error(uploadError)
        return
      }
      tier3ImagePath = path || null
    }

    if (props.pet) {
      const { error } = await adminPetsStore.updatePet(props.pet.id, {
        name: values.name,
        rarity: values.rarity,
        imagePath,
        tier2ImagePath,
        tier3ImagePath,
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Pet updated successfully')
    } else {
      if (!imagePath) {
        toast.error('Tier 1 image is required')
        return
      }
      const { error } = await adminPetsStore.createPet({
        name: values.name,
        rarity: values.rarity,
        imagePath,
        tier2ImagePath,
        tier3ImagePath,
      })
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Pet created successfully')
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
    <DialogContent class="sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ pet ? 'Edit Pet' : 'Add Pet' }}</DialogTitle>
        <DialogDescription>
          {{ pet ? 'Update pet details.' : 'Create a new gacha pet.' }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="handleSave">
        <!-- Pet Name -->
        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="pet-name">Name <span class="text-destructive">*</span></FieldLabel>
            <Input
              id="pet-name"
              placeholder="Enter pet name"
              :disabled="isSaving"
              :aria-invalid="!!errors.length"
              v-bind="field"
            />
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <!-- Rarity -->
        <VeeField v-slot="{ handleChange, value, errors }" name="rarity">
          <Field :data-invalid="!!errors.length">
            <FieldLabel>Rarity <span class="text-destructive">*</span></FieldLabel>
            <Select :model-value="value" :disabled="isSaving" @update:model-value="handleChange">
              <SelectTrigger class="w-full" :class="{ 'border-destructive': !!errors.length }">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(config, rarity) in rarityConfig" :key="rarity" :value="rarity">
                  <span :class="config.color">{{ config.label }}</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldError :errors="errors" />
          </Field>
        </VeeField>

        <!-- Pet Images (3 Tiers) -->
        <div class="space-y-4">
          <FieldLabel>Evolution Images</FieldLabel>
          <div class="grid grid-cols-3 gap-6">
            <!-- Tier 1 Image -->
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted-foreground">Tier 1 (Required)</p>
              <div v-if="formImagePath" class="relative">
                <img
                  :src="
                    formImageFile
                      ? formImagePath
                      : petsStore.getPetImageUrl(formImagePath, pet?.updatedAt)
                  "
                  alt="Tier 1 preview"
                  class="aspect-square w-full rounded-lg border object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  class="absolute -right-1 -top-1 size-5"
                  :disabled="isSaving"
                  @click="removeImage(1)"
                >
                  <X class="size-3" />
                </Button>
              </div>
              <div v-else>
                <input
                  ref="imageInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="(e) => handleImageUpload(e, 1)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="w-full"
                  :disabled="isSaving"
                  @click="imageInputRef?.click()"
                >
                  <ImagePlus class="mr-1 size-3" />
                  T1
                </Button>
              </div>
            </div>

            <!-- Tier 2 Image -->
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted-foreground">Tier 2 (Optional)</p>
              <div v-if="formTier2ImagePath" class="relative">
                <img
                  :src="
                    formTier2ImageFile
                      ? formTier2ImagePath
                      : petsStore.getPetImageUrl(formTier2ImagePath, pet?.updatedAt)
                  "
                  alt="Tier 2 preview"
                  class="aspect-square w-full rounded-lg border object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  class="absolute -right-1 -top-1 size-5"
                  :disabled="isSaving"
                  @click="removeImage(2)"
                >
                  <X class="size-3" />
                </Button>
              </div>
              <div v-else>
                <input
                  ref="tier2ImageInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="(e) => handleImageUpload(e, 2)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="w-full"
                  :disabled="isSaving"
                  @click="tier2ImageInputRef?.click()"
                >
                  <ImagePlus class="mr-1 size-3" />
                  T2
                </Button>
              </div>
            </div>

            <!-- Tier 3 Image -->
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted-foreground">Tier 3 (Optional)</p>
              <div v-if="formTier3ImagePath" class="relative">
                <img
                  :src="
                    formTier3ImageFile
                      ? formTier3ImagePath
                      : petsStore.getPetImageUrl(formTier3ImagePath, pet?.updatedAt)
                  "
                  alt="Tier 3 preview"
                  class="aspect-square w-full rounded-lg border object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  class="absolute -right-1 -top-1 size-5"
                  :disabled="isSaving"
                  @click="removeImage(3)"
                >
                  <X class="size-3" />
                </Button>
              </div>
              <div v-else>
                <input
                  ref="tier3ImageInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="(e) => handleImageUpload(e, 3)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="w-full"
                  :disabled="isSaving"
                  @click="tier3ImageInputRef?.click()"
                >
                  <ImagePlus class="mr-1 size-3" />
                  T3
                </Button>
              </div>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">
            If tier images are not provided, the previous tier's image will be used.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
            Cancel
          </Button>
          <Button type="submit" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ pet ? 'Update' : 'Create' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
