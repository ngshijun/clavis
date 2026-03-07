import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useAuthStore } from '@/stores/auth'
import { getStudentTourSteps } from './tour/studentTourSteps'
import { getParentTourSteps } from './tour/parentTourSteps'

const TOUR_CACHE_PREFIX = 'tour_completed_'

function getCacheKey(userId: string): string {
  return `${TOUR_CACHE_PREFIX}${userId}`
}

/** Check localStorage cache for tour completion */
function isTourCached(userId: string): boolean {
  return localStorage.getItem(getCacheKey(userId)) === 'true'
}

/** Set localStorage cache */
function setCacheCompleted(userId: string, completed: boolean) {
  if (completed) {
    localStorage.setItem(getCacheKey(userId), 'true')
  } else {
    localStorage.removeItem(getCacheKey(userId))
  }
}

const showWelcomeDialog = ref(false)
let driverInstance: Driver | null = null

export function useTour() {
  const authStore = useAuthStore()
  const router = useRouter()

  /** Whether this user should see the tour (not completed, not cached) */
  function shouldShowTour(): boolean {
    const user = authStore.user
    if (!user) return false
    if (user.userType !== 'student' && user.userType !== 'parent') return false

    // Check localStorage cache first (avoids extra DB query)
    if (isTourCached(user.id)) return false

    // Fall back to DB value (already loaded in auth store)
    return !user.hasCompletedTour
  }

  /** Trigger the welcome dialog (called from AppLayout after dashboard loads) */
  function promptTour() {
    if (shouldShowTour()) {
      showWelcomeDialog.value = true
    }
  }

  /** Start the driver.js tour */
  function startTour() {
    showWelcomeDialog.value = false

    const userType = authStore.user?.userType
    const steps = userType === 'student' ? getStudentTourSteps() : getParentTourSteps()

    driverInstance = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'clavis-tour-popover',
      steps,
      onDestroyed: () => {
        // Fires on both completion and skip
        completeTour()
      },
    })

    driverInstance.drive()
  }

  /** Mark tour as completed in DB + localStorage */
  async function completeTour() {
    const userId = authStore.user?.id
    if (!userId) return

    setCacheCompleted(userId, true)
    await authStore.setTourCompleted(true)
    driverInstance = null
  }

  /** Skip tour (same as complete — user chose not to see it) */
  async function skipTour() {
    showWelcomeDialog.value = false
    await completeTour()
  }

  /** Reset tour (for "Restart Tour" button on profile page) */
  async function resetAndStartTour() {
    const userId = authStore.user?.id
    if (!userId) return

    setCacheCompleted(userId, false)
    await authStore.setTourCompleted(false)

    // Navigate to dashboard first so tour elements are visible
    const dashboardPath = `/${authStore.user!.userType}/dashboard`
    await router.push(dashboardPath)

    // Wait for dashboard to render before starting tour
    setTimeout(() => {
      startTour()
    }, 500)
  }

  return {
    showWelcomeDialog,
    shouldShowTour,
    promptTour,
    startTour,
    skipTour,
    resetAndStartTour,
  }
}
