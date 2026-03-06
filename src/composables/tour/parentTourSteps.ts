import type { DriveStep } from 'driver.js'

export function getParentTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-sidebar="group-content"]',
      popover: {
        title: 'Navigation Menu',
        description: 'This is your navigation menu. Use it to access all the features of the app.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: 'a[href="/parent/children"]',
      popover: {
        title: 'Children',
        description:
          "Link and manage your children here. Send an invitation code to connect with your child's account.",
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/parent/statistics"]',
      popover: {
        title: 'Statistics',
        description:
          "Track your children's learning progress, accuracy rates, and practice history.",
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/parent/subscription"]',
      popover: {
        title: 'Subscription',
        description:
          'Manage your subscription plan here. Upgrade to unlock more daily practice sessions for your children.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/parent/announcements"]',
      popover: {
        title: 'Announcements',
        description: 'Stay updated with the latest news and announcements.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="sidebar-profile"]',
      popover: {
        title: 'Your Profile',
        description:
          'Access your profile here. You can restart this tour anytime from your Profile page.',
        side: 'right',
        align: 'end',
      },
    },
  ]
}
