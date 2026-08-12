import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/database.types'

type UserRole = Database['public']['Enums']['user_role']

/**
 * Route guards for data preloading
 * Store modules are dynamically imported to keep them out of the initial bundle.
 * Each guard uses fire-and-forget pattern (non-blocking).
 */

// Student routes: fire-and-forget data preloading (non-blocking)
function studentRouteGuard() {
  Promise.all([import('@/stores/curriculum'), import('@/stores/announcements')]).then(
    ([curriculumMod, announcementsMod]) => {
      const curriculumStore = curriculumMod.useCurriculumStore()
      const announcementsStore = announcementsMod.useAnnouncementsStore()

      if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
        curriculumStore.fetchCurriculum()
      }

      if (announcementsStore.announcements.length === 0 && !announcementsStore.isLoading) {
        announcementsStore.fetchAnnouncements()
      }
    },
  )
}

// Manager routes: fire-and-forget data preloading (non-blocking)
function managerRouteGuard() {
  import('@/stores/manager-teachers').then((teachersMod) => {
    const teachersStore = teachersMod.useManagerTeachersStore()

    if (teachersStore.teachers.length === 0 && !teachersStore.isLoading) {
      teachersStore.fetchTeachers()
    }
  })
}

// Teacher routes: fire-and-forget data preloading (non-blocking)
function teacherRouteGuard() {
  Promise.all([import('@/stores/teacher-students'), import('@/stores/curriculum')]).then(
    ([studentsMod, curriculumMod]) => {
      const studentsStore = studentsMod.useTeacherStudentsStore()
      const curriculumStore = curriculumMod.useCurriculumStore()

      if (studentsStore.students.length === 0 && !studentsStore.isLoading) {
        studentsStore.fetchStudents()
      }

      if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
        curriculumStore.fetchCurriculum()
      }
    },
  )
}

// Admin routes: fire-and-forget data preloading (non-blocking)
function adminRouteGuard() {
  Promise.all([
    import('@/stores/curriculum'),
    import('@/stores/questions'),
    import('@/stores/announcements'),
    import('@/stores/feedback'),
  ]).then(([curriculumMod, questionsMod, announcementsMod, feedbackMod]) => {
    const curriculumStore = curriculumMod.useCurriculumStore()
    const questionsStore = questionsMod.useQuestionsStore()
    const announcementsStore = announcementsMod.useAnnouncementsStore()
    const feedbackStore = feedbackMod.useFeedbackStore()

    if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
      curriculumStore.fetchCurriculum()
    }

    if (questionsStore.questions.length === 0 && !questionsStore.isLoading) {
      questionsStore.fetchQuestions()
    }

    if (announcementsStore.announcements.length === 0 && !announcementsStore.isLoading) {
      announcementsStore.fetchAnnouncements()
    }

    if (feedbackStore.feedbacks.length === 0 && !feedbackStore.isLoading) {
      feedbackStore.fetchFeedbacks()
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
          path: 'announcements',
          name: 'admin-announcements',
          component: () => import('@/pages/admin/AnnouncementsPage.vue'),
        },
        {
          path: 'organizations',
          name: 'admin-organizations',
          component: () => import('@/pages/admin/OrganizationsPage.vue'),
        },
        {
          path: 'students',
          name: 'admin-students',
          component: () => import('@/pages/admin/StudentsPage.vue'),
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
      path: '/manager',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, allowedRoles: ['manager'] },
      redirect: '/manager/dashboard',
      beforeEnter: managerRouteGuard,
      children: [
        {
          path: 'dashboard',
          name: 'manager-dashboard',
          component: () => import('@/pages/manager/DashboardPage.vue'),
        },
        {
          path: 'classes',
          name: 'manager-classes',
          component: () => import('@/pages/shared/ClassesPage.vue'),
        },
        {
          path: 'assessments',
          name: 'manager-assessments',
          component: () => import('@/pages/shared/AssessmentsPage.vue'),
        },
        {
          path: 'assessments/:assessmentId',
          name: 'manager-assessment-builder',
          component: () => import('@/pages/shared/AssessmentBuilderPage.vue'),
        },
        {
          path: 'assessments/:assessmentId/results',
          name: 'manager-assessment-results',
          component: () => import('@/pages/shared/AssessmentResultsPage.vue'),
        },
        {
          path: 'profile',
          name: 'manager-profile',
          component: () => import('@/pages/shared/StaffProfilePage.vue'),
        },
      ],
    },
    {
      path: '/teacher',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true, allowedRoles: ['teacher'] },
      redirect: '/teacher/dashboard',
      beforeEnter: teacherRouteGuard,
      children: [
        {
          path: 'dashboard',
          name: 'teacher-dashboard',
          component: () => import('@/pages/teacher/DashboardPage.vue'),
        },
        {
          path: 'classes',
          name: 'teacher-classes',
          component: () => import('@/pages/shared/ClassesPage.vue'),
        },
        {
          path: 'assessments',
          name: 'teacher-assessments',
          component: () => import('@/pages/shared/AssessmentsPage.vue'),
        },
        {
          path: 'assessments/:assessmentId',
          name: 'teacher-assessment-builder',
          component: () => import('@/pages/shared/AssessmentBuilderPage.vue'),
        },
        {
          path: 'assessments/:assessmentId/results',
          name: 'teacher-assessment-results',
          component: () => import('@/pages/shared/AssessmentResultsPage.vue'),
        },
        {
          path: 'profile',
          name: 'teacher-profile',
          component: () => import('@/pages/shared/StaffProfilePage.vue'),
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
    // Catch-all route for unknown paths: route authenticated users to their
    // role dashboard (no login flash / extra hop) and guests to login.
    {
      path: '/:pathMatch(.*)*',
      redirect: () => {
        const authStore = useAuthStore()
        if (authStore.isAuthenticated) {
          return getDashboardPath(authStore.userType)
        }
        return '/login'
      },
    },
  ],
})

// Navigation guard
export function getDashboardPath(userType: UserRole | null): string {
  if (userType === 'admin') return '/admin/dashboard'
  if (userType === 'manager') return '/manager/dashboard'
  if (userType === 'teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (!authStore.isInitialized) {
    await authStore.initialize()
  }

  const isAuthenticated = authStore.isAuthenticated
  const userType = authStore.userType

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresGuest = to.matched.some((record) => record.meta.requiresGuest)
  const allowedRoles = to.matched.find((record) => record.meta.allowedRoles)?.meta.allowedRoles as
    | string[]
    | undefined

  if (requiresGuest && isAuthenticated) {
    return getDashboardPath(userType)
  }

  if (requiresAuth && !isAuthenticated) {
    return '/login'
  }

  if (requiresAuth && allowedRoles && userType && !allowedRoles.includes(userType)) {
    return getDashboardPath(userType)
  }
})

export default router
