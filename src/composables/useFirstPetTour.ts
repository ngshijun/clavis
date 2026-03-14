import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore } from '@/stores/pets'
import { useTour } from './useTour'
import { loadDriver } from './tour/loadDriver'

/** Wait for a DOM element to appear (MutationObserver-based, no timeout — waits indefinitely) */
function waitForElement(selector: string): Promise<Element> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector)
      if (found) {
        observer.disconnect()
        resolve(found)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

/** Wait for a DOM element to disappear (MutationObserver-based, no timeout) */
function waitForElementGone(selector: string): Promise<void> {
  return new Promise((resolve) => {
    if (!document.querySelector(selector)) return resolve()

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
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

export function useFirstPetTour() {
  const authStore = useAuthStore()
  const petsStore = usePetsStore()
  const router = useRouter()
  const { showWelcomeDialog } = useTour()

  function shouldShowFirstPetTour(): boolean {
    if (!authStore.user) return false
    if (authStore.user.userType !== 'student') return false
    if (petsStore.ownedPets.length > 0) return false
    if (showWelcomeDialog.value) return false
    if (tourInstance) return false
    return true
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
      popoverClass: 'clavis-first-pet-popover',
      steps: getFirstPetTourSteps({
        // Step 1: User clicks Collections sidebar link → navigates to Collections page
        onCollectionsStepReady: () => {
          ensureSidebarOpen()
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/collections') {
              removeGuard()
              await waitForElement('[data-tour="unlock-new-pets"]')
              tourInstance?.moveNext()
            }
          })
        },

        // Step 2: User clicks "Unlock New Pets" → navigates to Gacha page
        onUnlockPetsStepReady: () => {
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/gacha') {
              removeGuard()
              await waitForElement('[data-tour="gacha-single-pull"]')
              tourInstance?.moveNext()
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
                // Pet drawn — wait for the Close button to appear, then highlight it
                await waitForElement('[data-tour="gacha-close-results"]')
                tourInstance?.moveNext()
              }
            },
          )
        },

        // Step 4: User clicks Close on the result dialog → dialog closes
        onCloseResultStepReady: () => {
          const waitForDialogClose = async () => {
            await waitForElementGone('[data-slot="dialog-content"]')
            ensureSidebarOpen()
            await waitForElement('a[href="/student/collections"]')
            tourInstance?.moveNext()
          }
          waitForDialogClose()
        },

        // Step 5: User clicks Collections sidebar link → back to Collections page
        onBackToCollectionsStepReady: () => {
          ensureSidebarOpen()
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/collections') {
              removeGuard()
              const card = (await waitForElement('[data-tour="first-pet-card"]')) as HTMLElement
              // Grid items stretch to fill the row height by default, which makes
              // the element's bounding box taller than its visual content.
              // Force content-height so driver.js highlights just the card.
              card.style.alignSelf = 'start'
              // Wait for the pet image inside the card to load so the layout is final
              // before driver.js calculates the highlight bounds.
              const img = card.querySelector('img')
              if (img && !img.complete) {
                await new Promise<void>((r) => {
                  img.addEventListener('load', () => r(), { once: true })
                  img.addEventListener('error', () => r(), { once: true })
                })
              }
              card.scrollIntoView({ behavior: 'smooth', block: 'center' })
              await new Promise<void>((r) => requestAnimationFrame(() => r()))
              tourInstance?.moveNext()
            }
          })
        },

        // Step 6: User clicks Cloud Bunny card → PetDetailDialog opens
        onPetCardStepReady: () => {
          const waitForDialog = async () => {
            await waitForElement('[data-tour="select-as-companion"]')
            tourInstance?.moveNext()
          }
          waitForDialog()
        },

        // Step 7: User clicks "Select as My Pet" → pet selected → go to dashboard
        onSelectCompanionStepReady: () => {
          const unwatch = watch(
            () => authStore.studentProfile?.selectedPetId,
            (petId) => {
              if (petId) {
                unwatch()
                tourInstance?.destroy()
                tourInstance = null
                router.push('/student/dashboard')
              }
            },
          )
        },
      }),
    })

    tourInstance.drive()
  }

  /** Watch for general tour dialog to close, then start first pet tour if needed */
  function watchAndStart() {
    if (shouldShowFirstPetTour()) {
      startFirstPetTour()
      return
    }

    // If general tour dialog is open, wait for it to close
    if (showWelcomeDialog.value && petsStore.ownedPets.length === 0) {
      const unwatch = watch(showWelcomeDialog, (open) => {
        if (!open && shouldShowFirstPetTour()) {
          unwatch()
          // Delay to let general tour start if user clicked "Start Tour"
          setTimeout(() => {
            if (shouldShowFirstPetTour()) {
              startFirstPetTour()
            }
          }, 500)
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
