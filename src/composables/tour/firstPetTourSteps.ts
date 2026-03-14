import type { DriveStep } from 'driver.js'

export interface FirstPetTourCallbacks {
  /** Step 1: User clicks Collections sidebar link */
  onCollectionsStepReady: () => void
  /** Step 2: User clicks "Unlock New Pets" button on Collections page */
  onUnlockPetsStepReady: () => void
  /** Step 3: User clicks the pull button on Gacha page */
  onPullStepReady: () => void
  /** Step 4: Show the pet result (Next button to continue) */
  onPetRevealStepReady: () => void
  /** Step 5: User clicks Close on the result dialog */
  onCloseResultStepReady: () => void
  /** Step 5: User clicks Collections sidebar link to go back */
  onBackToCollectionsStepReady: () => void
  /** Step 6: User clicks Cloud Bunny card to open detail dialog */
  onPetCardStepReady: () => void
  /** Step 7: User clicks "Select as My Pet" in the detail dialog */
  onSelectCompanionStepReady: () => void
  /** Step 8: User clicks X to close the detail dialog */
  onCloseDetailStepReady: () => void
  /** Step 9: User clicks Dashboard sidebar link */
  onDashboardStepReady: () => void
  /** Step 10: Final — highlight pet card on dashboard */
  onFinalStepReady: () => void
}

export function getFirstPetTourSteps(callbacks: FirstPetTourCallbacks): DriveStep[] {
  return [
    {
      element: 'a[href="/student/collections"]',
      onHighlightStarted: () => {
        callbacks.onCollectionsStepReady()
      },
      popover: {
        title: "Let's Get Your First Pet!",
        description: 'Every student gets a free starter pet. Tap "Collections" to start!',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-tour="unlock-new-pets"]',
      onHighlightStarted: () => {
        callbacks.onUnlockPetsStepReady()
      },
      popover: {
        title: 'Unlock New Pets',
        description:
          'This is where you can spend coins to collect pets. Tap "Unlock New Pets" to visit the gacha machine!',
        side: 'bottom',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-tour="gacha-single-pull"]',
      onHighlightStarted: () => {
        callbacks.onPullStepReady()
      },
      popover: {
        title: 'Draw Your Free Pet!',
        description: 'This is the gacha machine! Tap the button to draw your free starter pet!',
        side: 'bottom',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-slot="dialog-content"]',
      disableActiveInteraction: true,
      popover: {
        title: 'Congratulations!',
        description: 'You got your first pet — Cloud Bunny!',
        side: 'right',
        align: 'center',
        showButtons: ['next'],
        nextBtnText: 'Nice!',
        onNextClick: () => {
          callbacks.onPetRevealStepReady()
        },
      },
    },
    {
      element: '[data-tour="gacha-close-results"]',
      onHighlightStarted: () => {
        callbacks.onCloseResultStepReady()
      },
      popover: {
        title: 'Continue Your Journey!',
        description: 'Tap "Close" to continue.',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: 'a[href="/student/collections"]',
      onHighlightStarted: () => {
        callbacks.onBackToCollectionsStepReady()
      },
      popover: {
        title: 'Meet Your New Friend!',
        description: 'Your Cloud Bunny is waiting! Tap "Collections" to see your new pet.',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-tour="first-pet-card"]',
      onHighlightStarted: () => {
        callbacks.onPetCardStepReady()
      },
      popover: {
        title: 'Your Cloud Bunny!',
        description: 'Tap Cloud Bunny to view its details and set it as your companion!',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-tour="select-as-companion"]',
      onHighlightStarted: () => {
        callbacks.onSelectCompanionStepReady()
      },
      popover: {
        title: 'Select Your Companion!',
        description: 'Tap "Select as My Pet" to set Cloud Bunny as your companion!',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-slot="dialog-close"]',
      onHighlightStarted: () => {
        callbacks.onCloseDetailStepReady()
      },
      popover: {
        title: 'Well Done!',
        description: 'Cloud Bunny is now your companion! Tap the X to close.',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: 'a[href="/student/dashboard"]',
      onHighlightStarted: () => {
        callbacks.onDashboardStepReady()
      },
      popover: {
        title: 'Head Home!',
        description: 'Tap "Dashboard" to see your pet on the home page!',
        side: 'right',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: '[data-tour="dashboard-pet"]',
      popover: {
        title: 'Your Pet is Here!',
        description:
          'Cloud Bunny is now your companion! Earn coins through practice to collect more pets. Enjoy your journey!',
        side: 'right',
        align: 'center',
        showButtons: ['next'],
        nextBtnText: 'Got it!',
        onNextClick: () => {
          callbacks.onFinalStepReady()
        },
      },
    },
  ]
}
