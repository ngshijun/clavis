import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Route guards for data preloading
 * Store modules are dynamically imported to keep them out of the initial bundle.
 * Each guard uses fire-and-forget pattern (non-blocking).
 */

// Parent routes: fire-and-forget data preloading (non-blocking)
function parentRouteGuard() {
  Promise.all([
    import('@/stores/child-link'),
    import('@/stores/announcements'),
    import('@/stores/subscription'),
  ]).then(([childLinkMod, announcementsMod, subscriptionMod]) => {
    const childLinkStore = childLinkMod.useChildLinkStore()
    const announcementsStore = announcementsMod.useAnnouncementsStore()
    const subscriptionStore = subscriptionMod.useSubscriptionStore()

    if (childLinkStore.linkedChildren.length === 0 && !childLinkStore.isLoading) {
      // Chain: once children load, preload their subscriptions
      childLinkStore.fetchLinkedChildren().then(() => {
        if (childLinkStore.linkedChildren.length > 0) {
          const childIds = childLinkStore.linkedChildren.map((c) => c.id)
          subscriptionStore.fetchChildrenSubscriptions(childIds)
        }
      })
    } else if (childLinkStore.linkedChildren.length > 0) {
      subscriptionStore.fetchChildrenSubscriptions(childLinkStore.linkedChildren.map((c) => c.id))
    }

    if (announcementsStore.announcements.length === 0 && !announcementsStore.isLoading) {
      announcementsStore.fetchAnnouncements()
    }

    subscriptionStore.fetchPlans()
  })
}

// Student routes: fire-and-forget data preloading (non-blocking)
function studentRouteGuard() {
  Promise.all([
    import('@/stores/curriculum'),
    import('@/stores/pets'),
    import('@/stores/parent-link'),
    import('@/stores/announcements'),
    import('@/stores/leaderboard'),
  ]).then(([curriculumMod, petsMod, parentLinkMod, announcementsMod, leaderboardMod]) => {
    const curriculumStore = curriculumMod.useCurriculumStore()
    const petsStore = petsMod.usePetsStore()
    const parentLinkStore = parentLinkMod.useParentLinkStore()
    const announcementsStore = announcementsMod.useAnnouncementsStore()
    const leaderboardStore = leaderboardMod.useLeaderboardStore()

    if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
      curriculumStore.fetchCurriculum()
    }

    if (petsStore.allPets.length === 0 && !petsStore.isLoading) {
      petsStore.fetchAllPets()
      petsStore.fetchOwnedPets()
    }

    if (parentLinkStore.linkedParents.length === 0 && !parentLinkStore.isLoading) {
      parentLinkStore.fetchLinkedParents()
    }

    if (announcementsStore.announcements.length === 0 && !announcementsStore.isLoading) {
      announcementsStore.fetchAnnouncements()
    }

    leaderboardStore.checkUnseenReward()
  })
}

// Admin routes: fire-and-forget data preloading (non-blocking)
function adminRouteGuard() {
  Promise.all([
    import('@/stores/curriculum'),
    import('@/stores/questions'),
    import('@/stores/pets'),
    import('@/stores/announcements'),
  ]).then(([curriculumMod, questionsMod, petsMod, announcementsMod]) => {
    const curriculumStore = curriculumMod.useCurriculumStore()
    const questionsStore = questionsMod.useQuestionsStore()
    const petsStore = petsMod.usePetsStore()
    const announcementsStore = announcementsMod.useAnnouncementsStore()

    if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
      curriculumStore.fetchCurriculum()
    }

    if (questionsStore.questions.length === 0 && !questionsStore.isLoading) {
      questionsStore.fetchQuestions()
    }

    if (petsStore.allPets.length === 0 && !petsStore.isLoading) {
      petsStore.fetchAllPets()
    }

    if (announcementsStore.announcements.length === 0 && !announcementsStore.isLoading) {
      announcementsStore.fetchAnnouncements()
    }
  })
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/pages/LandingPage.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/auth/LoginPage.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/pages/auth/SignupPage.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/signup/confirm',
      name: 'signup-confirm',
      component: () => import('@/pages/auth/SignupConfirmPage.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/pages/auth/ForgotPasswordPage.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/pages/auth/ResetPasswordPage.vue'),
      // No requiresGuest - user may have a session from the reset link
    },
    {
      path: '/admin',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, allowedRoles: ['admin'] },
      redirect: '/admin/dashboard',
      beforeEnter: adminRouteGuard,
      children: [
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('@/pages/admin/DashboardPage.vue'),
        },
        {
          path: 'curriculum',
          name: 'admin-curriculum',
          component: () => import('@/pages/admin/CurriculumPage.vue'),
        },
        {
          path: 'question-bank',
          name: 'admin-question-bank',
          component: () => import('@/pages/admin/QuestionBankPage.vue'),
        },
        {
          path: 'question-statistics',
          name: 'admin-question-statistics',
          component: () => import('@/pages/admin/QuestionStatisticsPage.vue'),
        },
        {
          path: 'question-feedback',
          name: 'admin-question-feedback',
          component: () => import('@/pages/admin/QuestionFeedbackPage.vue'),
        },
        {
          path: 'pets',
          name: 'admin-pets',
          component: () => import('@/pages/admin/PetsPage.vue'),
        },
        {
          path: 'announcements',
          name: 'admin-announcements',
          component: () => import('@/pages/admin/AnnouncementsPage.vue'),
        },
        {
          path: 'leaderboard',
          name: 'admin-leaderboard',
          component: () => import('@/pages/student/LeaderboardPage.vue'),
        },
        {
          path: 'students',
          name: 'admin-students',
          component: () => import('@/pages/admin/StudentsPage.vue'),
        },
        {
          path: 'payment-history',
          name: 'admin-payment-history',
          component: () => import('@/pages/admin/PaymentHistoryPage.vue'),
        },
        {
          path: 'students/:studentId/statistics',
          name: 'admin-student-statistics',
          component: () => import('@/pages/admin/StudentStatisticsPage.vue'),
        },
        {
          path: 'students/:studentId/session/:sessionId',
          name: 'admin-student-session',
          component: () => import('@/pages/admin/StudentSessionResultPage.vue'),
        },
        {
          path: 'profile',
          name: 'admin-profile',
          component: () => import('@/pages/admin/ProfilePage.vue'),
        },
      ],
    },
    {
      path: '/student',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, allowedRoles: ['student'] },
      redirect: '/student/dashboard',
      beforeEnter: studentRouteGuard,
      children: [
        {
          path: 'dashboard',
          name: 'student-dashboard',
          component: () => import('@/pages/student/DashboardPage.vue'),
        },
        {
          path: 'practice',
          name: 'student-practice',
          component: () => import('@/pages/student/PracticePage.vue'),
        },
        {
          path: 'practice/quiz',
          name: 'student-practice-quiz',
          component: () => import('@/pages/student/PracticeQuizPage.vue'),
        },
        {
          path: 'session/:sessionId',
          name: 'student-session-result',
          component: () => import('@/pages/student/SessionResultPage.vue'),
        },
        {
          path: 'statistics',
          name: 'student-statistics',
          component: () => import('@/pages/student/StatisticsPage.vue'),
        },
        {
          path: 'parent',
          name: 'student-parent',
          component: () => import('@/pages/student/ParentPage.vue'),
        },
        {
          path: 'leaderboard',
          name: 'student-leaderboard',
          component: () => import('@/pages/student/LeaderboardPage.vue'),
        },
        {
          path: 'my-pet',
          name: 'student-my-pet',
          component: () => import('@/pages/student/MyPetPage.vue'),
        },
        {
          path: 'collections',
          name: 'student-collections',
          component: () => import('@/pages/student/CollectionsPage.vue'),
        },
        {
          path: 'gacha',
          name: 'student-gacha',
          component: () => import('@/pages/student/GachaPage.vue'),
        },
        {
          path: 'announcements',
          name: 'student-announcements',
          component: () => import('@/pages/shared/AnnouncementsPage.vue'),
        },
        {
          path: 'profile',
          name: 'student-profile',
          component: () => import('@/pages/student/ProfilePage.vue'),
        },
      ],
    },
    {
      path: '/parent',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, allowedRoles: ['parent'] },
      redirect: '/parent/dashboard',
      beforeEnter: parentRouteGuard,
      children: [
        {
          path: 'dashboard',
          name: 'parent-dashboard',
          component: () => import('@/pages/parent/DashboardPage.vue'),
        },
        {
          path: 'children',
          name: 'parent-children',
          component: () => import('@/pages/parent/ChildrenPage.vue'),
        },
        {
          path: 'statistics',
          name: 'parent-statistics',
          component: () => import('@/pages/parent/StatisticsPage.vue'),
        },
        {
          path: 'session/:childId/:sessionId',
          name: 'parent-session-result',
          component: () => import('@/pages/parent/SessionResultPage.vue'),
        },
        {
          path: 'announcements',
          name: 'parent-announcements',
          component: () => import('@/pages/shared/AnnouncementsPage.vue'),
        },
        {
          path: 'subscription',
          name: 'parent-subscription',
          component: () => import('@/pages/parent/SubscriptionPage.vue'),
        },
        {
          path: 'profile',
          name: 'parent-profile',
          component: () => import('@/pages/parent/ProfilePage.vue'),
        },
        {
          path: 'contact',
          name: 'parent-contact',
          component: () => import('@/pages/parent/ContactPage.vue'),
        },
      ],
    },
    // Catch-all route for 404
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
})

// Navigation guard
router.beforeEach(
  async (
    to: RouteLocationNormalized,
    _from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ) => {
    const authStore = useAuthStore()

    // Initialize auth if not already done
    if (!authStore.isInitialized) {
      await authStore.initialize()
    }

    const isAuthenticated = authStore.isAuthenticated
    const userType = authStore.userType

    // Check if route requires authentication
    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
    const requiresGuest = to.matched.some((record) => record.meta.requiresGuest)
    const allowedRoles = to.matched.find((record) => record.meta.allowedRoles)?.meta
      .allowedRoles as string[] | undefined

    // If route requires guest (login/signup) and user is authenticated
    if (requiresGuest && isAuthenticated) {
      // Redirect to appropriate dashboard
      if (userType === 'admin') {
        return next('/admin/dashboard')
      } else if (userType === 'student') {
        return next('/student/dashboard')
      } else if (userType === 'parent') {
        return next('/parent/dashboard')
      }
    }

    // If route requires auth and user is not authenticated
    if (requiresAuth && !isAuthenticated) {
      return next('/login')
    }

    // If route requires specific role and user doesn't have it
    if (requiresAuth && allowedRoles && userType && !allowedRoles.includes(userType)) {
      // Redirect to user's own dashboard
      if (userType === 'admin') {
        return next('/admin/dashboard')
      } else if (userType === 'student') {
        return next('/student/dashboard')
      } else if (userType === 'parent') {
        return next('/parent/dashboard')
      }
    }

    next()
  },
)

export default router
