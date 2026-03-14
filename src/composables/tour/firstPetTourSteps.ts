import type { DriveStep } from 'driver.js'

interface FirstPetTourCallbacks {
  onNavigateToGacha: () => void
  onPull: () => void
  onNavigateToCollections: () => void
  onSelectPet: () => void
}

export function getFirstPetTourSteps(callbacks: FirstPetTourCallbacks): DriveStep[] {
  return [
    {
      element: '[data-tour="sidebar-pets"]',
      popover: {
        title: "Let's Get Your First Pet!",
        description:
          'Every student gets a free starter pet. Tap "Next" to visit the gacha machine!',
        side: 'right',
        align: 'center',
        showButtons: ['next'],
        onNextClick: () => {
          callbacks.onNavigateToGacha()
        },
      },
    },
    {
      element: '[data-tour="gacha-single-pull"]',
      popover: {
        title: 'Draw Your Free Pet!',
        description:
          'This is the gacha machine where you collect pets! Tap "Next" to draw your free starter pet!',
        side: 'bottom',
        align: 'center',
        showButtons: ['next'],
        nextBtnText: 'Draw!',
        onNextClick: () => {
          callbacks.onPull()
        },
      },
    },
    {
      element: 'a[href="/student/collections"]',
      popover: {
        title: 'Meet Your New Friend!',
        description:
          'Your Cloud Bunny is waiting! Tap "Next" to visit your collection and select it as your companion.',
        side: 'right',
        align: 'center',
        showButtons: ['next'],
        onNextClick: () => {
          callbacks.onNavigateToCollections()
        },
      },
    },
    {
      element: '[data-tour="first-pet-card"]',
      popover: {
        title: 'Select Your Companion!',
        description: 'Tap "Done" to set Cloud Bunny as your pet companion!',
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
