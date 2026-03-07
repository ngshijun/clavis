<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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

const subscriptionStore = useSubscriptionStore()
const childLinkStore = useChildLinkStore()

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
  // Ensure children are loaded (guard is non-blocking)
  if (childLinkStore.linkedChildren.length === 0 && !childLinkStore.isLoading) {
    await childLinkStore.fetchLinkedChildren()
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

  if (isSuccess && sessionId && selectedChildId.value) {
    const { error } = await subscriptionStore.syncSubscription(selectedChildId.value, sessionId)

    if (!error) {
      toast.success('Subscription activated!', {
        description: 'Your subscription has been successfully activated.',
      })
      const childIds = childLinkStore.linkedChildren.map((c) => c.id)
      await subscriptionStore.fetchChildrenSubscriptions(childIds, true)
    } else {
      toast.error('Sync issue', {
        description: error || 'Subscription may not be fully synced. Please refresh the page.',
      })
    }
    window.history.replaceState({}, '', window.location.pathname)
  } else if (isCanceled) {
    toast.error('Checkout cancelled', {
      description: 'You cancelled the checkout process.',
    })
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
  return subscriptionStore.getChildSubscription(selectedChildId.value)
})

const currentPlan = computed(() => {
  if (!selectedChildId.value) return null
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
    await handleCancel()
    resetUpgradeState()
    return
  }

  const hasStripe = subscriptionStore.hasActiveStripeSubscription(selectedChildId.value)

  if (hasStripe) {
    const result = await subscriptionStore.modifySubscription(selectedChildId.value, tier)
    if (result.error) {
      toast.error('Error', { description: result.error })
    } else if (result.type === 'scheduled') {
      const scheduledDate = result.scheduledDate
        ? new Date(result.scheduledDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'next billing cycle'
      toast.success('Downgrade scheduled', {
        description: `Your plan will change to ${tier} on ${scheduledDate}. You'll keep your current plan until then.`,
      })
    } else {
      toast.success('Subscription upgraded!', {
        description: `Plan has been upgraded to ${tier}. Your billing cycle has been reset.`,
      })
    }
  } else {
    const { url, error } = await subscriptionStore.createCheckoutSession(
      selectedChildId.value,
      tier,
    )
    if (error) {
      toast.error('Error', { description: error })
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

async function handleCancel() {
  if (!selectedChildId.value) return

  const hasStripe = subscriptionStore.hasActiveStripeSubscription(selectedChildId.value)

  if (!hasStripe) {
    toast.info('No active subscription', {
      description: 'This child is already on the basic tier.',
    })
    return
  }

  const { error } = await subscriptionStore.cancelStripeSubscription(selectedChildId.value, false)
  if (error) {
    toast.error('Error', { description: error })
  } else {
    toast.success('Subscription cancelled', {
      description: 'Your subscription will end at the current billing period.',
    })
  }
}

async function handleOpenPortal() {
  const { url, error } = await subscriptionStore.openCustomerPortal()
  if (error) {
    toast.error('Error', { description: error })
  } else if (url) {
    window.location.href = url
  }
}

function getStatusBadge(subscription: ReturnType<typeof subscriptionStore.getChildSubscription>) {
  if (!subscription.stripe) return null

  if (subscription.stripe.cancelAtPeriodEnd) {
    return { text: 'Cancels soon', variant: 'destructive' as const }
  }

  if (subscription.scheduledChange) {
    return { text: 'Downgrade scheduled', variant: 'secondary' as const }
  }

  if (subscription.stripe.stripeStatus === 'past_due') {
    return { text: 'Payment failed', variant: 'destructive' as const }
  }

  if (subscription.stripe.stripeStatus === 'active') {
    return { text: 'Active', variant: 'default' as const }
  }

  return null
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Subscription</h1>
        <p class="text-muted-foreground">Manage subscriptions for your children</p>
      </div>

      <!-- Manage Billing Button -->
      <Button
        v-if="subscriptionStore.hasAnyStripeSubscription"
        variant="outline"
        @click="handleOpenPortal"
      >
        <CreditCard class="mr-2 size-4" />
        Manage Billing
        <ExternalLink class="ml-2 size-3" />
      </Button>
    </div>

    <!-- Loading State -->
    <div
      v-if="
        subscriptionStore.isLoading ||
        subscriptionStore.isProcessingPayment ||
        childLinkStore.isLoading
      "
      class="flex items-center justify-center py-16"
    >
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- No Children State -->
    <div v-else-if="childLinkStore.linkedChildren.length === 0" class="py-16 text-center">
      <Users class="mx-auto size-16 text-muted-foreground/50" />
      <h2 class="mt-4 text-lg font-semibold">No Linked Children</h2>
      <p class="mt-2 text-muted-foreground">
        Link a child to manage their subscription. Go to the Children page to send an invitation.
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
              Select Child
            </CardTitle>
            <CardDescription>Choose a child to manage their subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <Select v-model="selectedChildId">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="Select a child" />
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
              Current Plan for {{ selectedChild?.name }}
            </CardTitle>
            <CardDescription>Active subscription details</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-2xl font-bold">{{ currentPlan.name }}</span>
                  <!-- Status badges -->
                  <template v-if="getStatusBadge(currentSubscription)">
                    <Badge :variant="getStatusBadge(currentSubscription)!.variant">
                      {{ getStatusBadge(currentSubscription)!.text }}
                    </Badge>
                  </template>
                  <template v-else>
                    <Badge v-if="currentSubscription.tier !== 'core'" variant="default">
                      Active
                    </Badge>
                    <Badge v-else variant="secondary">Free Tier</Badge>
                  </template>
                </div>
                <!-- Show period end for Stripe subscriptions -->
                <p
                  v-if="currentSubscription.stripe?.currentPeriodEnd"
                  class="text-sm text-muted-foreground"
                >
                  <template v-if="currentSubscription.stripe.cancelAtPeriodEnd">
                    Ends on {{ formatDate(currentSubscription.stripe.currentPeriodEnd) }}
                  </template>
                  <template v-else-if="currentSubscription.scheduledChange">
                    Changing to
                    <span class="font-medium text-amber-600 dark:text-amber-400">
                      {{
                        subscriptionStore.plans.find(
                          (p) => p.id === currentSubscription?.scheduledChange?.scheduledTier,
                        )?.name || currentSubscription?.scheduledChange?.scheduledTier
                      }}
                    </span>
                    on {{ formatDate(currentSubscription?.scheduledChange?.scheduledChangeDate) }}
                  </template>
                  <template v-else>
                    Renews on {{ formatDate(currentSubscription.stripe.currentPeriodEnd) }}
                  </template>
                </p>
              </div>
              <div class="text-right">
                <div class="text-3xl font-bold">
                  RM {{ currentPlan.price.toFixed(2) }}
                  <span class="text-base font-normal text-muted-foreground">/month</span>
                </div>
                <p class="text-sm text-muted-foreground">
                  {{ currentPlan.sessionsPerDay }} sessions/day
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter
            v-if="
              currentSubscription.tier !== 'core' && !currentSubscription.stripe?.cancelAtPeriodEnd
            "
          >
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button variant="outline" class="text-destructive hover:text-destructive">
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel {{ selectedChild?.name }}'s subscription?
                    <template v-if="currentSubscription.stripe?.stripeSubscriptionId">
                      The subscription will remain active until
                      {{ formatDate(currentSubscription.stripe.currentPeriodEnd) }}, then
                      automatically downgrade to Basic.
                    </template>
                    <template v-else>
                      They will be downgraded to the Basic tier immediately.
                    </template>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction
                    class="bg-destructive text-white hover:bg-destructive/90"
                    @click="handleCancel"
                  >
                    Cancel Subscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>

      <!-- Subscription Tiers -->
      <div v-if="currentSubscription">
        <h2 class="mb-4 text-xl font-semibold">Available Plans</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <PlanCard
            v-for="plan in subscriptionStore.visiblePlans"
            :key="plan.id"
            :plan="plan"
            :current-tier="currentSubscription.tier"
            :is-processing-payment="subscriptionStore.isProcessingPayment"
            :scheduled-change="currentSubscription.scheduledChange"
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
          @update:open="upgradeDialogOpen = $event"
          @confirm="confirmPlanChange"
          @cancel="resetUpgradeState"
        />
      </div>

      <!-- Feature Comparison Note -->
      <Card>
        <CardHeader>
          <CardTitle class="text-lg">Plan Features Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-lg border p-4">
              <div class="flex items-center gap-2">
                <Zap class="size-5 text-blue-500" />
                <h3 class="font-semibold">Plus</h3>
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                More practice sessions per day and detailed session history including individual
                questions and answers. Great for identifying specific areas to improve.
              </p>
            </div>
            <div class="rounded-lg border p-4">
              <div class="flex items-center gap-2">
                <Sparkles class="size-5 text-purple-500" />
                <h3 class="font-semibold">Pro</h3>
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                All Plus features plus AI-powered feedback after each session with personalized
                weakness analysis and learning recommendations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
