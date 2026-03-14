import { watch, onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore } from '@/stores/pets'
import { useTour } from './useTour'
import { loadDriver } from './tour/loadDriver'
import { toast } from 'vue-sonner'

const WAIT_TIMEOUT_MS = 30_000

/** Wait for a DOM element to appear, with a timeout to avoid hanging forever */
function waitForElement(selector: string): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) {
        clearTimeout(timeout)
        observer.disconnect()
        resolve(found)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timed out waiting for element: ${selector}`))
    }, WAIT_TIMEOUT_MS)
  })
}

/** Wait for a DOM element to disappear, with a timeout to avoid hanging forever */
function waitForElementGone(selector: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(selector)) return resolve()

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        clearTimeout(timeout)
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timed out waiting for element to disappear: ${selector}`))
    }, WAIT_TIMEOUT_MS)
  })
}

/** Ensure sidebar is visible (expand on mobile if needed) */
function ensureSidebarOpen() {
  const sidebar = document.querySelector('[data-sidebar="sidebar"]')
  if (!sidebar) {
    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLElement | null
    trigger?.click()
  }
}

let tourInstance: ReturnType<typeof import('driver.js').driver> | null = null

function destroyTour() {
  if (tourInstance) {
    tourInstance.destroy()
    tourInstance = null
  }
}

export function useFirstPetTour() {
  const authStore = useAuthStore()
  const petsStore = usePetsStore()
  const router = useRouter()
  const { showWelcomeDialog, isTourActive } = useTour()

  // Clean up tour instance when the calling component's scope is disposed
  onScopeDispose(destroyTour)

  function shouldShowFirstPetTour(): boolean {
    if (!authStore.user) return false
    if (authStore.user.userType !== 'student') return false
    if (petsStore.ownedPets.length > 0) return false
    if (showWelcomeDialog.value) return false
    if (isTourActive.value) return false
    if (tourInstance) return false
    return true
  }

  /** Wraps an async step callback so that if it rejects (e.g. timeout), the tour is destroyed gracefully */
  function safeStep(fn: () => Promise<void>) {
    fn().catch((err) => {
      console.error('First pet tour step failed:', err)
      destroyTour()
      toast.error('The onboarding tour ran into an issue. Please try again later.')
    })
  }

  async function startFirstPetTour() {
    const [driver, { getFirstPetTourSteps }] = await Promise.all([
      loadDriver(),
      import('./tour/firstPetTourSteps'),
    ])

    tourInstance = driver({
      allowClose: false,
      overlayClickBehavior: () => undefined,
      showProgress: true,
      animate: true,
      smoothScroll: true,
      stagePadding: 4,
      stageRadius: 8,
      popoverClass: 'clavis-tour-popover',
      steps: getFirstPetTourSteps({
        // Step 1: User clicks Collections sidebar link → navigates to Collections page
        onCollectionsStepReady: () => {
          ensureSidebarOpen()
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/collections') {
              removeGuard()
              safeStep(async () => {
                await waitForElement('[data-tour="unlock-new-pets"]')
                tourInstance?.moveNext()
              })
            }
          })
        },

        // Step 2: User clicks "Unlock New Pets" → navigates to Gacha page
        onUnlockPetsStepReady: () => {
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/gacha') {
              removeGuard()
              safeStep(async () => {
                await waitForElement('[data-tour="gacha-single-pull"]')
                tourInstance?.moveNext()
              })
            }
          })
        },

        // Step 3: User clicks the pull button → animation → result dialog appears
        onPullStepReady: () => {
          // Watch ownedPets reactively — when it goes from 0 to > 0, the pull succeeded.
          const unwatch = watch(
            () => petsStore.ownedPets.length,
            async (newLen) => {
              if (newLen > 0) {
                unwatch()
                // Pet drawn — wait for the result pet card to appear, then show pet reveal
                safeStep(async () => {
                  await waitForElement('[data-tour="gacha-result-pet"]')
                  tourInstance?.moveNext()
                })
              }
            },
          )
        },

        // Step 4: "Nice!" button → advance to close button step
        onPetRevealStepReady: () => {
          tourInstance?.moveNext()
        },

        // Step 5: User clicks Close on the result dialog → dialog closes
        onCloseResultStepReady: () => {
          safeStep(async () => {
            await waitForElementGone('[data-slot="dialog-content"]')
            ensureSidebarOpen()
            await waitForElement('a[href="/student/collections"]')
            tourInstance?.moveNext()
          })
        },

        // Step 6: User clicks Collections sidebar link → back to Collections page
        onBackToCollectionsStepReady: () => {
          ensureSidebarOpen()
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/collections') {
              removeGuard()
              safeStep(async () => {
                const card = (await waitForElement('[data-tour="first-pet-card"]')) as HTMLElement
                // Disable transition so layout changes are instant (transition-all
                // would animate align-self change, causing driver.js to read the
                // bounding box mid-animation).
                card.style.transition = 'none'
                card.style.alignSelf = 'start'
                // Wait for the pet image to load so aspect-square has final dimensions
                const img = card.querySelector('img')
                if (img && !img.complete) {
                  await new Promise<void>((r) => {
                    img.addEventListener('load', () => r(), { once: true })
                    img.addEventListener('error', () => r(), { once: true })
                  })
                }
                // Force layout recalculation, then wait two frames for it to settle
                card.getBoundingClientRect()
                await new Promise<void>((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => r())),
                )
                card.scrollIntoView({ block: 'center' })
                tourInstance?.moveNext()
              })
            }
          })
        },

        // Step 7: User clicks Cloud Bunny card → PetDetailDialog opens
        onPetCardStepReady: () => {
          safeStep(async () => {
            await waitForElement('[data-tour="select-as-companion"]')
            tourInstance?.moveNext()
          })
        },

        // Step 8: User clicks "Select as My Pet" → pet selected
        onSelectCompanionStepReady: () => {
          const unwatch = watch(
            () => authStore.studentProfile?.selectedPetId,
            async (petId) => {
              if (petId) {
                unwatch()
                // Pet selected — advance to X close button step
                safeStep(async () => {
                  await waitForElement('[data-slot="dialog-close"]')
                  tourInstance?.moveNext()
                })
              }
            },
          )
        },

        // Step 9: User clicks X to close the detail dialog
        onCloseDetailStepReady: () => {
          safeStep(async () => {
            await waitForElementGone('[data-slot="dialog-content"]')
            ensureSidebarOpen()
            await waitForElement('a[href="/student/dashboard"]')
            tourInstance?.moveNext()
          })
        },

        // Step 10: User clicks Dashboard sidebar link
        onDashboardStepReady: () => {
          ensureSidebarOpen()
          // Pre-warm the async component chunk and dashboard data while user reads the popover,
          // so navigating to dashboard doesn't waterfall (API calls → then chunk load).
          import('@/components/dashboard/CurrentPetCard.vue')
          import('@/stores/student-dashboard').then(({ useStudentDashboardStore }) =>
            useStudentDashboardStore().fetchTodayStatus(),
          )
          import('@/stores/practice-history').then(({ usePracticeHistoryStore }) =>
            usePracticeHistoryStore().fetchSessionHistory(),
          )

          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/dashboard') {
              removeGuard()
              safeStep(async () => {
                await waitForElement('[data-tour="dashboard-pet"]')
                tourInstance?.moveNext()
              })
            }
          })
        },

        // Step 11: "Got it!" button — destroy the tour
        onFinalStepReady: () => {
          destroyTour()
        },
      }),
    })

    tourInstance.drive()
  }

  /** Watch for general tour to finish, then start first pet tour if needed */
  function watchAndStart() {
    if (shouldShowFirstPetTour()) {
      startFirstPetTour()
      return
    }

    // If general tour dialog or tour is active, wait for it to finish
    if ((showWelcomeDialog.value || isTourActive.value) && petsStore.ownedPets.length === 0) {
      const unwatch = watch(isTourActive, (active) => {
        if (!active && shouldShowFirstPetTour()) {
          unwatch()
          startFirstPetTour()
        }
      })
    }
  }

  return {
    shouldShowFirstPetTour,
    startFirstPetTour,
    watchAndStart,
  }
}
