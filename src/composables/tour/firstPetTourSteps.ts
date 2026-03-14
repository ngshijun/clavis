import type { DriveStep } from 'driver.js'

export interface FirstPetTourCallbacks {
  /** Called when step 1 is highlighted — set up route watcher for /student/gacha */
  onGachaStepReady: () => void
  /** Called when step 2 is highlighted — set up dialog lifecycle watcher */
  onPullStepReady: () => void
  /** Called when step 3 is highlighted — set up route watcher for /student/collections */
  onCollectionsStepReady: () => void
  /** Called when user clicks Done on step 4 — select pet + complete */
  onSelectPet: () => void
}

export function getFirstPetTourSteps(callbacks: FirstPetTourCallbacks): DriveStep[] {
  return [
    {
      element: '[data-tour="sidebar-pets"]',
      onHighlightStarted: () => {
        callbacks.onGachaStepReady()
      },
      popover: {
        title: "Let's Get Your First Pet!",
        description:
          'Every student gets a free starter pet. Tap "My Pet" to visit the gacha machine!',
        side: 'right',
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
        description:
          'This is the gacha machine where you collect pets! Tap the button to draw your free starter pet!',
        side: 'bottom',
        align: 'center',
        showButtons: [],
      },
    },
    {
      element: 'a[href="/student/collections"]',
      onHighlightStarted: () => {
        callbacks.onCollectionsStepReady()
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
