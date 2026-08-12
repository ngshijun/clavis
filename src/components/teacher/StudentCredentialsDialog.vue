<script setup lang="ts">
import type { CreatedAccount } from '@/composables/useCreateUser'
import { Copy } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()

const props = defineProps<{
  account: CreatedAccount | null
}>()

const open = defineModel<boolean>('open', { default: false })

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(t.value.teacher.studentCredentials.toastCopied)
  } catch (err) {
    console.error('Failed to copy credentials:', err)
    toast.error(t.value.teacher.studentCredentials.toastCopyFailed)
  }
}

function copyBoth() {
  if (!props.account) return
  copy(
    `${t.value.teacher.studentCredentials.usernameLabel}: ${props.account.username}\n` +
      `${t.value.teacher.studentCredentials.passwordLabel}: ${props.account.password}`,
  )
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t.teacher.studentCredentials.title }}</DialogTitle>
        <DialogDescription>
          {{ t.teacher.studentCredentials.description(account?.name ?? '') }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="account" class="space-y-3 py-4">
        <div class="flex items-center justify-between gap-2 rounded-lg border p-3">
          <div class="min-w-0">
            <p class="text-sm text-muted-foreground">
              {{ t.teacher.studentCredentials.usernameLabel }}
            </p>
            <p class="truncate font-mono font-medium">{{ account.username }}</p>
          </div>
          <Button variant="outline" size="sm" @click="copy(account.username ?? '')">
            <Copy class="mr-2 size-4" />
            {{ t.teacher.studentCredentials.copy }}
          </Button>
        </div>

        <div class="flex items-center justify-between gap-2 rounded-lg border p-3">
          <div class="min-w-0">
            <p class="text-sm text-muted-foreground">
              {{ t.teacher.studentCredentials.passwordLabel }}
            </p>
            <p class="truncate font-mono font-medium">{{ account.password }}</p>
          </div>
          <Button variant="outline" size="sm" @click="copy(account.password)">
            <Copy class="mr-2 size-4" />
            {{ t.teacher.studentCredentials.copy }}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="copyBoth">
          <Copy class="mr-2 size-4" />
          {{ t.teacher.studentCredentials.copyAll }}
        </Button>
        <Button @click="open = false">{{ t.teacher.studentCredentials.done }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
