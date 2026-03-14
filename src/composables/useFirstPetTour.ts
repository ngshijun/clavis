import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore } from '@/stores/pets'
import { useTour } from './useTour'
import { loadDriver } from './tour/loadDriver'

/** Wait for a DOM element to appear (MutationObserver-based, not setTimeout) */
function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
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
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/** Wait for a DOM element to disappear */
function waitForElementGone(selector: string, timeout = 60000): Promise<void> {
  return new Promise((resolve) => {
    if (!document.querySelector(selector)) return resolve()

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve()
    }, timeout)
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
      stagePadding: 8,
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

        // Step 3: User clicks the pull button → animation → result dialog → close
        onPullStepReady: () => {
          const waitForPullComplete = async () => {
            // Wait for the result dialog to appear (shadcn-vue dialog-content)
            await waitForElement('[data-slot="dialog-content"]')
            // Wait for user to close it
            await waitForElementGone('[data-slot="dialog-content"]')

            // Small delay for DOM to settle, then advance
            await new Promise((r) => setTimeout(r, 300))
            ensureSidebarOpen()
            await waitForElement('a[href="/student/collections"]')
            tourInstance?.moveNext()
          }
          waitForPullComplete()
        },

        // Step 4: User clicks Collections sidebar link → back to Collections page
        onBackToCollectionsStepReady: () => {
          ensureSidebarOpen()
          const removeGuard = router.afterEach(async (to) => {
            if (to.path === '/student/collections') {
              removeGuard()
              await waitForElement('[data-tour="first-pet-card"]')
              tourInstance?.moveNext()
            }
          })
        },

        // Step 5: "Done" button → select Cloud Bunny and go to dashboard
        onSelectPet: async () => {
          const cloudBunny = petsStore.allPets.find((p) => p.name === 'Cloud Bunny')
          if (cloudBunny) {
            await petsStore.selectPet(cloudBunny.id)
          }
          tourInstance?.destroy()
          tourInstance = null
          router.push('/student/dashboard')
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
