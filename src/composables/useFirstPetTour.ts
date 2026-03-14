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
        onNavigateToGacha: async () => {
          ensureSidebarOpen()
          await router.push('/student/gacha')
          await waitForElement('[data-tour="gacha-single-pull"]')
          tourInstance?.moveNext()
        },

        onPull: async () => {
          // Programmatically click GachaPage's pull button so its own
          // useGachaPull instance handles animation and result dialog.
          const btn = document.querySelector(
            '[data-tour="gacha-single-pull"]',
          ) as HTMLElement | null
          btn?.click()

          // Wait for the result dialog to appear, then wait for it to close.
          // Use data-slot="dialog-content" (shadcn-vue) to avoid matching driver.js's own popover
          // which also has role="dialog".
          await waitForElement('[data-slot="dialog-content"]')
          await waitForElementGone('[data-slot="dialog-content"]')

          // Small delay for DOM to settle after dialog closes
          await new Promise((r) => setTimeout(r, 300))
          ensureSidebarOpen()
          await waitForElement('a[href="/student/collections"]')
          tourInstance?.moveNext()
        },

        onNavigateToCollections: async () => {
          await router.push('/student/collections')
          await waitForElement('[data-tour="first-pet-card"]')
          tourInstance?.moveNext()
        },

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
