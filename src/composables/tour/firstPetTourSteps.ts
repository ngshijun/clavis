import type { DriveStep } from 'driver.js'

export interface FirstPetTourCallbacks {
  /** Step 1: User clicks Collections sidebar link */
  onCollectionsStepReady: () => void
  /** Step 2: User clicks "Unlock New Pets" button on Collections page */
  onUnlockPetsStepReady: () => void
  /** Step 3: User clicks the pull button on Gacha page */
  onPullStepReady: () => void
  /** Step 4: User clicks Collections sidebar link to go back */
  onBackToCollectionsStepReady: () => void
  /** Step 5: User clicks Done to select Cloud Bunny */
  onSelectPet: () => void
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
      popover: {
        title: 'Select Your Companion!',
        description: 'Here\'s your Cloud Bunny! Tap "Done" to set it as your pet companion!',
        side: 'top',
        align: 'center',
        showButtons: ['next'],
        nextBtnText: 'Done!',
        onNextClick: () => {
          callbacks.onSelectPet()
        },
      },
    },
  ]
}
