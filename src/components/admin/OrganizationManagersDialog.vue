<script setup lang="ts">
import type { Organization } from '@/stores/admin-organizations'
import { UserPlus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()

defineProps<{
  organization: Organization | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  addManager: []
}>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{
          t.admin.organizationManagers.title(organization?.name ?? '')
        }}</DialogTitle>
        <DialogDescription>{{ t.admin.organizationManagers.description }}</DialogDescription>
      </DialogHeader>

      <div class="py-2">
        <div v-if="!organization?.managers.length" class="py-8 text-center text-muted-foreground">
          {{ t.admin.organizationManagers.empty }}
        </div>

        <div v-else class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t.admin.organizationManagers.nameCol }}</TableHead>
                <TableHead>{{ t.admin.organizationManagers.emailCol }}</TableHead>
                <TableHead>{{ t.admin.organizationManagers.joinedCol }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="manager in organization.managers" :key="manager.id">
                <TableCell class="font-medium">{{ manager.name }}</TableCell>
                <TableCell class="text-muted-foreground">{{ manager.email }}</TableCell>
                <TableCell>{{ formatDate(manager.joinedAt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">
          {{ t.admin.organizationManagers.close }}
        </Button>
        <Button @click="emit('addManager')">
          <UserPlus class="mr-2 size-4" />
          {{ t.admin.organizationManagers.addManager }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
