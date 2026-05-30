import { ref, computed, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useStudentDashboardStore } from '@/stores/student-dashboard'
import { useAuthStore } from '@/stores/auth'
import { useTour } from './useTour'
import { isFirstPetTourActive } from './useFirstPetTour'

const MOOD_REMINDER_DISMISSED_KEY = 'mood_reminder_dismissed_date'

export const isMoodReminderOpen = ref(false)

export function openMoodReminder() {
  isMoodReminderOpen.value = true
}

export function useMoodReminder() {
  const dashboardStore = useStudentDashboardStore()
  const authStore = useAuthStore()
  const { showWelcomeDialog, isTourActive } = useTour()

  // Namespace the dismissal key by user id so a shared device does not let one
  // student's dismissal suppress another student's reminder on the same MYT day.
  // (localStorage is not a Pinia store, so resetAllStores() on signOut never clears it.)
  const dismissedDate = computed(() =>
    useLocalStorage(`${MOOD_REMINDER_DISMISSED_KEY}:${authStore.user?.id ?? 'anon'}`, ''),
  )

  const isDismissedToday = computed({
    get: () => dismissedDate.value.value === dashboardStore.getTodayString(),
    set: (val) => {
      dismissedDate.value.value = val ? dashboardStore.getTodayString() : ''
    },
  })

  function shouldShow(): boolean {
    if (dashboardStore.hasMoodToday) return false
    if (isDismissedToday.value) return false
    return true
  }

  function watchAndStart() {
    const conditionsMet = computed(
      () =>
        !!dashboardStore.todayStatus &&
        !showWelcomeDialog.value &&
        !isTourActive.value &&
        !isFirstPetTourActive.value,
    )

    const fire = () => {
      if (shouldShow()) openMoodReminder()
    }

    if (conditionsMet.value) {
      fire()
      return
    }

    const stop = watch(conditionsMet, (met) => {
      if (met) {
        stop()
        fire()
      }
    })
  }

  return {
    isDismissedToday,
    watchAndStart,
  }
}
