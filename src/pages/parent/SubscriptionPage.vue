<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useT } from '@/composables/useT'
import {
  useSubscriptionStore,
  type SubscriptionTier,
  type UpgradePreview,
} from '@/stores/subscription'
import { useChildLinkStore } from '@/stores/child-link'
import { toast } from 'vue-sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Sparkles, Zap, CreditCard, Users, Loader2, ExternalLink } from 'lucide-vue-next'
import PlanCard from '@/components/parent/PlanCard.vue'
import UpgradePreviewDialog from '@/components/parent/UpgradePreviewDialog.vue'
import { useLanguageStore } from '@/stores/language'

const subscriptionStore = useSubscriptionStore()
const childLinkStore = useChildLinkStore()
const t = useT()
const languageStore = useLanguageStore()

const SELECTED_CHILD_KEY = 'parent_selected_child_id'
const selectedChildId = ref<string>(localStorage.getItem(SELECTED_CHILD_KEY) || '')

// Upgrade preview state
const upgradePreview = ref<UpgradePreview | null>(null)
const isLoadingPreview = ref(false)
const previewError = ref<string | null>(null)
const upgradeDialogOpen = ref(false)
const pendingUpgradeTier = ref<SubscriptionTier | null>(null)

const pendingPlan = computed(() =>
  subscriptionStore.plans.find((p) => p.id === pendingUpgradeTier.value),
)

// Handle checkout redirect on mount
onMounted(async () => {
  // Ensure plans are loaded before rendering plan/price details. The route
  // guard fetches these fire-and-forget; on a hard reload it may not have
  // resolved yet, leaving currentPlan undefined and the Current Subscription
  // card hidden. Awaiting here makes rendering deterministic.
  await subscriptionStore.fetchPlans()

  // Ensure children are loaded (guard is non-blocking)
  if (childLinkStore.linkedChildren.length === 0 && !childLinkStore.isLoading) {
    await childLinkStore.fetchLinkedChildren()
  }

  // Ensure subscriptions are loaded for the linked children. The route guard
  // fetches these fire-and-forget; awaiting here guarantees the page never
  // renders a paying child as a fabricated Core default during a fetch gap.
  if (childLinkStore.linkedChildren.length > 0) {
    await subscriptionStore.fetchChildrenSubscriptions(
      childLinkStore.linkedChildren.map((c) => c.id),
    )
  }

  // Restore saved selection or select first child
  const savedChildId = localStorage.getItem(SELECTED_CHILD_KEY)
  const isValidSelection = childLinkStore.linkedChildren.some((c) => c.id === savedChildId)

  if (savedChildId && isValidSelection) {
    selectedChildId.value = savedChildId
  } else if (childLinkStore.linkedChildren.length > 0 && !selectedChildId.value) {
    selectedChildId.value = childLinkStore.linkedChildren[0]?.id ?? ''
  }

  // Handle Stripe checkout redirect
  const urlParams = new URLSearchParams(window.location.search)
  const sessionId = urlParams.get('session_id')
  const isSuccess = urlParams.get('success') === 'true'
  const isCanceled = urlParams.get('canceled') === 'true'

  // Prefer the student id round-tripped through the success URL by the edge
  // function over the locally-selected child: the parent may have switched
  // the selector (or it may be empty) after starting checkout. Fall back to
  // the current selection when the URL does not carry one.
  const checkoutChildId = urlParams.get('student_id') || selectedChildId.value

  if (isSuccess && sessionId && checkoutChildId) {
    const { error } = await subscriptionStore.syncSubscription(checkoutChildId, sessionId)

    if (!error) {
      toast.success(t.value.parent.subscription.toastActivated, {
        description: t.value.parent.subscription.toastActivatedDesc,
      })
      const childIds = childLinkStore.linkedChildren.map((c) => c.id)
      await subscriptionStore.fetchChildrenSubscriptions(childIds, true)
    } else {
      toast.error(t.value.parent.subscription.toastSyncIssue, {
        description: error || t.value.parent.subscription.toastSyncIssueDesc,
      })
    }
  } else if (isCanceled) {
    toast.error(t.value.parent.subscription.toastCheckoutCancelled, {
      description: t.value.parent.subscription.toastCheckoutCancelledDesc,
    })
  }

  // Always strip checkout query params so a refresh does not re-trigger the
  // redirect handler, regardless of which branch (or none) ran above.
  if (isSuccess || isCanceled) {
    window.history.replaceState({}, '', window.location.pathname)
  }
})

// Persist selection to localStorage
watch(selectedChildId, (newId) => {
  if (newId) {
    localStorage.setItem(SELECTED_CHILD_KEY, newId)
  }
})

const selectedChild = computed(() => {
  return childLinkStore.linkedChildren.find((c) => c.id === selectedChildId.value)
})

const currentSubscription = computed(() => {
  if (!selectedChildId.value) return null
  // Until a real fetch has landed, getChildSubscription fabricates a Core
  // default — do not surface that as the child's actual tier, or a paying
  // child could be shown as free Core with an "Upgrade" CTA that starts a
  // second checkout. The loading state covers the gap.
  if (!subscriptionStore.hasFetchedSubscriptions) return null
  return subscriptionStore.getChildSubscription(selectedChildId.value)
})

const currentPlan = computed(() => {
  if (!selectedChildId.value) return null
  if (!subscriptionStore.hasFetchedSubscriptions) return null
  return subscriptionStore.getChildPlan(selectedChildId.value)
})

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function handlePlanChange(tier: SubscriptionTier) {
  if (!selectedChildId.value) return

  if (tier === 'core') {
    pendingUpgradeTier.value = tier
    upgradeDialogOpen.value = true
    return
  }

  const hasStripe = subscriptionStore.hasActiveStripeSubscription(selectedChildId.value)

  if (hasStripe) {
    isLoadingPreview.value = true
    previewError.value = null
    upgradePreview.value = null
    pendingUpgradeTier.value = tier
    upgradeDialogOpen.value = true

    const { preview, error } = await subscriptionStore.previewUpgrade(selectedChildId.value, tier)
    isLoadingPreview.value = false

    if (error) {
      previewError.value = error
    } else {
      upgradePreview.value = preview
    }
  } else {
    pendingUpgradeTier.value = tier
    upgradeDialogOpen.value = true
  }
}

async function confirmPlanChange() {
  if (!selectedChildId.value || !pendingUpgradeTier.value) return

  const tier = pendingUpgradeTier.value
  upgradeDialogOpen.value = false

  if (tier === 'core') {
    await handleCancel('downgrade')
    resetUpgradeState()
    return
  }

  const hasStripe = subscriptionStore.hasActiveStripeSubscription(selectedChildId.value)

  if (hasStripe) {
    const result = await subscriptionStore.modifySubscription(selectedChildId.value, tier)
    if (result.error) {
      toast.error(t.value.parent.subscription.toastError, { description: result.error })
    } else if (result.type === 'scheduled') {
      const scheduledDate = result.scheduledDate
        ? new Date(result.scheduledDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'next billing cycle'
      toast.success(t.value.parent.subscription.toastDowngradeScheduled, {
        description: t.value.parent.subscription.toastDowngradeScheduledDesc(tier, scheduledDate),
      })
    } else {
      toast.success(t.value.parent.subscription.toastUpgraded, {
        description: t.value.parent.subscription.toastUpgradedDesc(tier),
      })
    }
  } else {
    const { url, error } = await subscriptionStore.createCheckoutSession(
      selectedChildId.value,
      tier,
    )
    if (error) {
      toast.error(t.value.parent.subscription.toastError, { description: error })
    } else if (url) {
      window.location.href = url
    }
  }

  resetUpgradeState()
}

function resetUpgradeState() {
  upgradePreview.value = null
  previewError.value = null
  pendingUpgradeTier.value = null
}

/**
 * Handle the cancel-at-period-end action.
 *
 * Called from two places with different user intent:
 * 1. "Cancel Subscription" button → user wants to cancel (framing=cancel)
 * 2. Plan picker selecting Core → user wants to downgrade (framing=downgrade)
 *
 * The Stripe call is identical in both cases (cancel_at_period_end=true
 * because Core is a free tier with no Stripe price). Only the toast copy
 * differs so the user sees their chosen action reflected in the wording.
 */
async function handleCancel(framing: 'cancel' | 'downgrade' = 'cancel') {
  if (!selectedChildId.value) return

  const hasStripe = subscriptionStore.hasActiveStripeSubscription(selectedChildId.value)

  if (!hasStripe) {
    toast.info(t.value.parent.subscription.toastNoActiveSub, {
      description: t.value.parent.subscription.toastNoActiveSubDesc,
    })
    return
  }

  const { error } = await subscriptionStore.cancelStripeSubscription(selectedChildId.value, false)
  if (error) {
    toast.error(t.value.parent.subscription.toastError, { description: error })
    return
  }

  if (framing === 'downgrade') {
    const periodEnd = currentSubscription.value?.stripe?.currentPeriodEnd
    const scheduledDate = periodEnd
      ? new Date(periodEnd).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'next billing cycle'
    const coreName = subscriptionStore.plans.find((p) => p.id === 'core')?.name ?? 'Core'
    toast.success(t.value.parent.subscription.toastDowngradeScheduled, {
      description: t.value.parent.subscription.toastDowngradeScheduledDesc(coreName, scheduledDate),
    })
  } else {
    toast.success(t.value.parent.subscription.toastCancelSuccess, {
      description: t.value.parent.subscription.toastCancelSuccessDesc,
    })
  }
}

async function handleCancelDowngrade() {
  if (!selectedChildId.value) return

  const { error } = await subscriptionStore.cancelDowngrade(selectedChildId.value)
  if (error) {
    toast.error(t.value.parent.subscription.toastError, { description: error })
  } else {
    toast.success(t.value.parent.subscription.toastCancelDowngradeSuccess, {
      description: t.value.parent.subscription.toastCancelDowngradeSuccessDesc,
    })
  }
}

async function handleOpenPortal() {
  const { url, error } = await subscriptionStore.openCustomerPortal()
  if (error) {
    toast.error(t.value.parent.subscription.toastError, { description: error })
  } else if (url) {
    window.location.href = url
  }
}

// Status badge derived from the selected child's subscription. A computed
// (not a method) so the three template bindings share one evaluation and the
// type narrows naturally via v-if instead of non-null assertions.
const statusBadge = computed(() => {
  const subscription = currentSubscription.value
  if (!subscription?.stripe) return null

  // cancel_at_period_end and scheduledChange are both "heading to a lower
  // tier at period end" from the user's perspective — show the same
  // downgrade-framed badge for both instead of leaking Stripe's two-state
  // representation (cancel vs schedule) to the parent.
  if (subscription.stripe.cancelAtPeriodEnd || subscription.scheduledChange) {
    return { text: t.value.parent.subscription.downgradeScheduled, variant: 'secondary' as const }
  }

  if (subscription.stripe.stripeStatus === 'past_due') {
    return { text: t.value.parent.subscription.paymentFailed, variant: 'destructive' as const }
  }

  if (subscription.stripe.stripeStatus === 'active') {
    return { text: t.value.parent.subscription.active, variant: 'default' as const }
  }

  return null
})
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t.parent.subscription.title }}</h1>
        <p class="text-muted-foreground">{{ t.parent.subscription.subtitle }}</p>
      </div>

      <!-- Manage Billing Button -->
      <Button
        v-if="subscriptionStore.hasAnyStripeSubscription"
        variant="outline"
        @click="handleOpenPortal"
      >
        <CreditCard class="mr-2 size-4" />
        {{ t.parent.subscription.manageBilling }}
        <ExternalLink class="ml-2 size-3" />
      </Button>
    </div>

    <!-- Loading State -->
    <div
      v-if="
        subscriptionStore.isLoading ||
        subscriptionStore.isProcessingPayment ||
        childLinkStore.isLoading ||
        (childLinkStore.linkedChildren.length > 0 && !subscriptionStore.hasFetchedSubscriptions)
      "
      class="flex items-center justify-center py-16"
    >
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- No Children State -->
    <div v-else-if="childLinkStore.linkedChildren.length === 0" class="py-16 text-center">
      <Users class="mx-auto size-16 text-muted-foreground/50" />
      <h2 class="mt-4 text-lg font-semibold">{{ t.parent.subscription.noLinkedChildrenTitle }}</h2>
      <p class="mt-2 text-muted-foreground">
        {{ t.parent.subscription.noLinkedChildrenDesc }}
      </p>
    </div>

    <template v-else>
      <!-- Child Selector and Current Subscription Side by Side -->
      <div class="grid gap-4 md:grid-cols-2">
        <!-- Child Selector -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Users class="size-5" />
              {{ t.parent.subscription.selectChildTitle }}
            </CardTitle>
            <CardDescription>{{ t.parent.subscription.selectChildDescription }}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select :key="languageStore.language" v-model="selectedChildId">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t.parent.subscription.selectChildPlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="child in childLinkStore.linkedChildren"
                  :key="child.id"
                  :value="child.id"
                >
                  {{ child.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <!-- Current Subscription Card -->
        <Card v-if="currentSubscription && currentPlan">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <CreditCard class="size-5" />
              {{ t.parent.subscription.currentPlanTitle(selectedChild?.name ?? '') }}
            </CardTitle>
            <CardDescription>{{ t.parent.subscription.currentPlanDescription }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-2xl font-bold">{{ currentPlan.name }}</span>
                  <!-- Status badges -->
                  <template v-if="statusBadge">
                    <Badge :variant="statusBadge.variant">
                      {{ statusBadge.text }}
                    </Badge>
                  </template>
                  <template v-else>
                    <Badge v-if="currentSubscription.tier !== 'core'" variant="default">
                      {{ t.parent.subscription.active }}
                    </Badge>
                    <Badge v-else variant="secondary">{{ t.parent.subscription.freeTier }}</Badge>
                  </template>
                </div>
                <!-- Show period end for Stripe subscriptions -->
                <p
                  v-if="currentSubscription.stripe?.currentPeriodEnd"
                  class="text-sm text-muted-foreground"
                >
                  <template v-if="currentSubscription.stripe.cancelAtPeriodEnd">
                    {{ t.parent.subscription.changingTo }}
                    <span class="font-medium text-amber-600 dark:text-amber-400">
                      {{ subscriptionStore.plans.find((p) => p.id === 'core')?.name || 'Core' }}
                    </span>
                    {{
                      t.parent.subscription.on(
                        formatDate(currentSubscription.stripe.currentPeriodEnd),
                      )
                    }}
                  </template>
                  <template v-else-if="currentSubscription.scheduledChange">
                    {{ t.parent.subscription.changingTo }}
                    <span class="font-medium text-amber-600 dark:text-amber-400">
                      {{
                        subscriptionStore.plans.find(
                          (p) => p.id === currentSubscription?.scheduledChange?.scheduledTier,
                        )?.name || currentSubscription?.scheduledChange?.scheduledTier
                      }}
                    </span>
                    {{
                      t.parent.subscription.on(
                        formatDate(currentSubscription?.scheduledChange?.scheduledChangeDate),
                      )
                    }}
                  </template>
                  <template v-else>
                    {{
                      t.parent.subscription.renewsOn(
                        formatDate(currentSubscription.stripe.currentPeriodEnd),
                      )
                    }}
                  </template>
                </p>
              </div>
              <div class="text-right">
                <div class="text-3xl font-bold">
                  RM {{ currentPlan.price.toFixed(2) }}
                  <span class="text-base font-normal text-muted-foreground">{{
                    t.parent.subscription.perMonth
                  }}</span>
                </div>
                <p class="text-sm text-muted-foreground">
                  {{ t.parent.subscription.sessionsPerDay(currentPlan.sessionsPerDay) }}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter v-if="currentSubscription.tier !== 'core'" class="flex flex-wrap gap-2">
            <!-- Cancel Downgrade: shown whenever a pending downgrade exists
                 (subscription_schedule OR cancel_at_period_end). Reverses the
                 pending change so the subscription stays on the current plan. -->
            <AlertDialog
              v-if="
                currentSubscription.stripe?.cancelAtPeriodEnd || currentSubscription.scheduledChange
              "
            >
              <AlertDialogTrigger as-child>
                <Button variant="outline" :disabled="subscriptionStore.isProcessingPayment">
                  <Loader2
                    v-if="subscriptionStore.isProcessingPayment"
                    class="mr-2 size-4 animate-spin"
                  />
                  {{ t.parent.subscription.cancelDowngradeButton }}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{{
                    t.parent.subscription.cancelDowngradeTitle
                  }}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {{
                      t.parent.subscription.cancelDowngradeConfirm(
                        currentPlan.name,
                        formatDate(currentSubscription.stripe?.currentPeriodEnd),
                      )
                    }}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{{
                    t.parent.subscription.cancelDowngradeDismiss
                  }}</AlertDialogCancel>
                  <AlertDialogAction @click="handleCancelDowngrade">
                    {{ t.parent.subscription.cancelDowngradeConfirmAction }}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <!-- Cancel Subscription: hidden once cancel_at_period_end is true
                 (already canceling — nothing more to cancel). Still shown when
                 only a scheduled downgrade exists, so the user can escalate
                 from "downgrade to Plus" to "cancel the whole thing". -->
            <AlertDialog v-if="!currentSubscription.stripe?.cancelAtPeriodEnd">
              <AlertDialogTrigger as-child>
                <Button variant="outline" class="text-destructive hover:text-destructive">
                  {{ t.parent.subscription.cancelSubscriptionButton }}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{{
                    t.parent.subscription.cancelSubscriptionTitle
                  }}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {{ t.parent.subscription.cancelSubscriptionConfirm(selectedChild?.name ?? '') }}
                    <template v-if="currentSubscription.stripe?.stripeSubscriptionId">
                      {{
                        t.parent.subscription.cancelSubscriptionStripeNote(
                          formatDate(currentSubscription.stripe.currentPeriodEnd),
                        )
                      }}
                    </template>
                    <template v-else>
                      {{ t.parent.subscription.cancelSubscriptionImmediateNote }}
                    </template>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{{
                    t.parent.subscription.keepSubscription
                  }}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" @click="handleCancel">
                    {{ t.parent.subscription.cancelSubscriptionButton }}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>

      <!-- Subscription Tiers -->
      <div v-if="currentSubscription">
        <h2 class="mb-4 text-xl font-semibold">{{ t.parent.subscription.availablePlansTitle }}</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <PlanCard
            v-for="plan in subscriptionStore.visiblePlans"
            :key="plan.id"
            :plan="plan"
            :current-tier="currentSubscription.tier"
            :is-processing-payment="subscriptionStore.isProcessingPayment"
            :processing-tier="subscriptionStore.processingTier"
            :scheduled-change="currentSubscription.scheduledChange"
            :cancel-at-period-end="currentSubscription.stripe?.cancelAtPeriodEnd ?? false"
            @change="handlePlanChange"
          />
        </div>

        <UpgradePreviewDialog
          :open="upgradeDialogOpen"
          :pending-tier="pendingUpgradeTier"
          :current-tier="currentSubscription?.tier ?? 'core'"
          :preview="upgradePreview"
          :is-loading="isLoadingPreview"
          :error="previewError"
          :child-name="selectedChild?.name ?? ''"
          :pending-plan="pendingPlan"
          :has-active-stripe-subscription="
            subscriptionStore.hasActiveStripeSubscription(selectedChildId)
          "
          :current-period-end="currentSubscription?.stripe?.currentPeriodEnd"
          @update:open="upgradeDialogOpen = $event"
          @confirm="confirmPlanChange"
          @cancel="resetUpgradeState"
        />
      </div>

      <!-- Feature Comparison Note -->
      <Card>
        <CardHeader>
          <CardTitle class="text-lg">{{ t.parent.subscription.planFeaturesTitle }}</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-lg border p-4">
              <div class="flex items-center gap-2">
                <Zap class="size-5 text-blue-500" />
                <h3 class="font-semibold">{{ t.parent.subscription.plusPlanTitle }}</h3>
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.parent.subscription.plusPlanDesc }}
              </p>
            </div>
            <div class="rounded-lg border p-4">
              <div class="flex items-center gap-2">
                <Sparkles class="size-5 text-purple-500" />
                <h3 class="font-semibold">{{ t.parent.subscription.proPlanTitle }}</h3>
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.parent.subscription.proPlanDesc }}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
