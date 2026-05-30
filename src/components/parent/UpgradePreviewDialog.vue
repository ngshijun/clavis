<script setup lang="ts">
import type { SubscriptionTier, SubscriptionPlan, UpgradePreview } from '@/stores/subscription'
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
import { Loader2 } from 'lucide-vue-next'
import { formatLongDate } from '@/lib/date'
import { useT } from '@/composables/useT'
import { tierRank } from '@/lib/tierConfig'

const t = useT()

const props = defineProps<{
  open: boolean
  pendingTier: SubscriptionTier | null
  currentTier: SubscriptionTier
  preview: UpgradePreview | null
  isLoading: boolean
  error: string | null
  childName: string
  pendingPlan: SubscriptionPlan | undefined
  hasActiveStripeSubscription: boolean
  // Used by the Core downgrade branch, which skips the Stripe preview call
  // (no Core price to preview against) but still needs the period_end date
  // for the "current plan active until X" line.
  currentPeriodEnd?: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

function getActionLabel() {
  if (props.pendingTier === 'core') return t.value.shared.upgradePreviewDialog.downgrade

  const planIndex = props.pendingTier ? tierRank(props.pendingTier) : -1
  return planIndex > tierRank(props.currentTier)
    ? t.value.shared.upgradePreviewDialog.upgrade
    : t.value.shared.upgradePreviewDialog.downgrade
}

function formatCurrency(amount: number) {
  return `RM ${(amount / 100).toFixed(2)}`
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ t.shared.upgradePreviewDialog.title(getActionLabel(), pendingPlan?.name ?? '') }}
        </AlertDialogTitle>
        <AlertDialogDescription as="div">
          <!-- Loading preview state -->
          <div v-if="isLoading" class="flex items-center justify-center py-4">
            <Loader2 class="mr-2 size-5 animate-spin" />
            <span>{{ t.shared.upgradePreviewDialog.calculatingPrice }}</span>
          </div>

          <!-- Preview error -->
          <div v-else-if="error" class="text-destructive">
            {{ error }}
          </div>

          <!-- Upgrade preview with proration details -->
          <template v-else-if="preview?.isUpgrade">
            <div class="space-y-4">
              <p>
                {{
                  t.shared.upgradePreviewDialog.prorationMessage(
                    formatCurrency(preview.amountDue ?? 0),
                  )
                }}
              </p>

              <!-- Line items breakdown -->
              <div
                v-if="preview.lineItems && preview.lineItems.length > 0"
                class="rounded-lg border p-3"
              >
                <p class="mb-2 text-sm font-medium">
                  {{ t.shared.upgradePreviewDialog.priceBreakdown }}
                </p>
                <ul class="space-y-1 text-sm">
                  <li
                    v-for="(item, index) in preview.lineItems"
                    :key="index"
                    class="flex justify-between"
                  >
                    <span :class="{ 'text-muted-foreground': item.proration }">
                      {{ item.description }}
                    </span>
                    <span :class="{ 'text-green-600': item.amount < 0 }">
                      {{ formatCurrency(item.amount) }}
                    </span>
                  </li>
                </ul>
                <div class="mt-2 flex justify-between border-t pt-2 font-medium">
                  <span>{{ t.shared.upgradePreviewDialog.totalDueToday }}</span>
                  <span>
                    {{ formatCurrency(preview.amountDue ?? 0) }}
                  </span>
                </div>
                <p class="mt-2 text-xs text-muted-foreground">
                  {{ t.shared.upgradePreviewDialog.prorationEstimateNote }}
                </p>
              </div>

              <p class="text-sm text-muted-foreground">
                {{
                  t.shared.upgradePreviewDialog.newPlanSessions(
                    childName,
                    pendingPlan?.sessionsPerDay ?? 0,
                  )
                }}
              </p>
            </div>
          </template>

          <!-- Downgrade scheduled for next billing cycle -->
          <template v-else-if="preview && !preview.isUpgrade">
            <div class="space-y-3">
              <p class="text-sm text-muted-foreground">
                {{
                  t.shared.upgradePreviewDialog.currentPlanActiveUntil(
                    formatLongDate(preview.effectiveDate),
                  )
                }}
              </p>
            </div>
          </template>

          <!-- Downgrade to basic -->
          <template v-else-if="pendingTier === 'core'">
            <div class="space-y-3">
              <p>
                {{
                  t.shared.upgradePreviewDialog.downgradeToCore(
                    childName,
                    pendingPlan?.sessionsPerDay ?? 0,
                  )
                }}
              </p>
              <p v-if="currentPeriodEnd" class="text-sm text-muted-foreground">
                {{
                  t.shared.upgradePreviewDialog.currentPlanActiveUntil(
                    formatLongDate(currentPeriodEnd),
                  )
                }}
              </p>
            </div>
          </template>

          <!-- New subscription (no Stripe subscription yet) -->
          <template v-else-if="!hasActiveStripeSubscription">
            {{
              t.shared.upgradePreviewDialog.redirectToCheckout(
                childName,
                pendingPlan?.sessionsPerDay ?? 0,
              )
            }}
          </template>

          <!-- Downgrade with active subscription -->
          <template v-else>
            {{ t.shared.upgradePreviewDialog.downgradeWithSub(childName, pendingPlan?.name ?? '') }}
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="emit('cancel')">{{
          t.shared.upgradePreviewDialog.cancel
        }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isLoading || !!error" @click="emit('confirm')">
          <template v-if="preview?.isUpgrade && preview.amountDue">
            {{ t.shared.upgradePreviewDialog.pay(formatCurrency(preview.amountDue)) }}
          </template>
          <template v-else>{{ t.shared.upgradePreviewDialog.confirm }}</template>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
