import type { DriveStep } from 'driver.js'

export function getStudentTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="sidebar-xp"]',
      popover: {
        title: 'XP & Level',
        description:
          'This is your experience bar. Earn XP by completing practice sessions to level up!',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Navigation Menu',
        description: 'This is your navigation menu. Use it to access all the features of the app.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: 'a[href="/student/practice"]',
      popover: {
        title: 'Practice',
        description:
          'Start practice sessions here. Choose your subject and topic, then answer questions to earn XP and coins.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/student/statistics"]',
      popover: {
        title: 'Statistics',
        description: 'View your learning progress, accuracy rates, and session history.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/student/leaderboard"]',
      popover: {
        title: 'Leaderboard',
        description:
          'Compete with other students! Climb the leaderboard by earning XP through practice.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: 'a[href="/student/my-pet"]',
      popover: {
        title: 'Pets & Collections',
        description: 'Manage your pets, feed them to evolve, and browse your full collection.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="student-currency"]',
      popover: {
        title: 'Coins & Food',
        description:
          'These are your coins and food. Earn coins by completing practice sessions, and use them to collect pets!',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="dashboard-daily"]',
      popover: {
        title: 'Daily Spin & Mood',
        description:
          'Spin the wheel for daily rewards and set your mood to let your parents know how you feel!',
        side: 'bottom',
        align: 'end',
      },
    },
    {
      element: '[data-tour="dashboard-pet"]',
      popover: {
        title: 'Your Pet Companion',
        description:
          'This is your pet! Collect pets through the gacha, feed them to evolve, and set your favourite as your companion.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="dashboard-streak"]',
      popover: {
        title: 'Practice Streak',
        description:
          'Track your daily practice streak here. Practice every day to keep your streak going!',
        side: 'left',
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
