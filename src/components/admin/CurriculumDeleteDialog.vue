<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import {
  type CurriculumLevel,
  type CurriculumIds,
  curriculumEntityConfig,
} from '@/lib/curriculumEntityConfig'
import { Loader2 } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()

const props = defineProps<{
  open: boolean
  deleteType: CurriculumLevel
  itemName: string
  gradeLevelId: string
  subjectId: string
  topicId: string
  stageId: string
  subTopicId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  deleted: [type: CurriculumLevel, ids: CurriculumIds]
}>()

const curriculumStore = useCurriculumStore()
const config = computed(() => curriculumEntityConfig[props.deleteType])
const isDeleting = ref(false)
const confirmInput = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      confirmInput.value = ''
    }
  },
)

async function confirmDelete() {
  isDeleting.value = true
  try {
    const ids: CurriculumIds = {
      gradeLevelId: props.gradeLevelId,
      subjectId: props.subjectId,
      topicId: props.topicId,
      stageId: props.stageId,
      subTopicId: props.subTopicId,
    }

    const result = await config.value.delete(curriculumStore, ids)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t.value.shared.curriculumDeleteDialog.toastDeleted(config.value.label))
      emit('deleted', props.deleteType, ids)
    }
  } finally {
    isDeleting.value = false
    emit('update:open', false)
  }
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t.shared.curriculumDeleteDialog.title(itemName) }}</AlertDialogTitle>
        <AlertDialogDescription as="div">
          <p>{{ config.deleteDescription }}</p>
          <p class="mt-3">
            {{ t.shared.curriculumDeleteDialog.typeToConfirm }}
            <span class="font-semibold text-foreground">{{ itemName }}</span>
            below:
          </p>
          <Input
            v-model="confirmInput"
            class="mt-2"
            :placeholder="itemName"
            :disabled="isDeleting"
          />
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isDeleting">{{
          t.shared.curriculumDeleteDialog.cancel
        }}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="isDeleting || confirmInput !== itemName"
          @click="confirmDelete"
        >
          <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
          {{ t.shared.curriculumDeleteDialog.delete }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
