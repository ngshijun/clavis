import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/database.types'

type UserRole = Database['public']['Enums']['user_role']

/**
 * Route guards for data preloading
 * Store modules are dynamically imported to keep them out of the initial bundle.
 * Each guard uses fire-and-forget pattern (non-blocking).
 */

/**
 * A student's surfaces are scoped to one classroom (decision 79), so the
 * candidate list is loaded alongside their other preloads. Pages react to
 * `selectedId` rather than waiting on this: the student can switch classroom
 * at any time, so a page that only read the scope once would go stale anyway.
 *
 * Teachers moved to a route-param classroom (decision 83) and managers are
 * institution-wide (decision 82), so this is now the student path only.
 */
function classroomScopeGuard() {
  import('@/stores/classroom-scope').then((mod) => {
    const scope = mod.useClassroomScopeStore()
    if (!scope.isReady && !scope.isLoading) {
      scope.fetchClassrooms()
    }
  })
}

// Student routes: fire-and-forget data preloading (non-blocking)
function studentRouteGuard() {
  classroomScopeGuard()
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

// Manager routes: fire-and-forget data preloading (non-blocking).
// No classroom scope — a manager's views are institution-wide (decision 82).
function managerRouteGuard() {
  Promise.all([import('@/stores/manager-teachers'), import('@/stores/curriculum')]).then(
    ([teachersMod, curriculumMod]) => {
      const teachersStore = teachersMod.useManagerTeachersStore()
      const curriculumStore = curriculumMod.useCurriculumStore()

      if (teachersStore.teachers.length === 0 && !teachersStore.isLoading) {
        teachersStore.fetchTeachers()
      }

      // Classroom + student provisioning forms need grade levels/subjects.
      if (curriculumStore.gradeLevels.length === 0 && !curriculumStore.isLoading) {
        curriculumStore.fetchCurriculum()
      }
    },
  )
}

// Teacher routes: the active classroom comes from the URL (decision 83), so
// there is no scope store to prime — only the classroom list it resolves against.
function teacherRouteGuard() {
  Promise.all([import('@/stores/classrooms'), import('@/stores/curriculum')]).then(
    ([classroomsMod, curriculumMod]) => {
      const classroomsStore = classroomsMod.useClassroomsStore()
      const curriculumStore = curriculumMod.useCurriculumStore()

      if (classroomsStore.classrooms.length === 0 && !classroomsStore.isLoading) {
        classroomsStore.fetchClassrooms()
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
      questionsStore.fetchBankQuestions()
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
          path: 'assessments',
          name: 'admin-assessment-templates',
          component: () => import('@/pages/shared/AssessmentsPage.vue'),
        },
        {
          path: 'assessments/:assessmentId',
          name: 'admin-assessment-template-builder',
          component: () => import('@/pages/shared/AssessmentBuilderPage.vue'),
        },
        {
          path: 'tags',
          name: 'admin-tags',
          component: () => import('@/pages/admin/TagsPage.vue'),
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
          component: () => import('@/pages/shared/StaffDashboardPage.vue'),
        },
        {
          path: 'teachers',
          name: 'manager-teachers',
          component: () => import('@/pages/manager/TeachersPage.vue'),
        },
        {
          path: 'students',
          name: 'manager-students',
          component: () => import('@/pages/manager/StudentsPage.vue'),
        },
        {
          path: 'classrooms',
          name: 'manager-classrooms',
          component: () => import('@/pages/shared/ClassroomsPage.vue'),
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
      redirect: '/teacher/classrooms',
      beforeEnter: teacherRouteGuard,
      children: [
        // The class picker (decision 83). Everything a teacher does belongs to
        // one classroom, so the classroom is a path segment rather than
        // persisted global state — see useActiveClassroom.
        {
          path: 'classrooms',
          name: 'teacher-classrooms',
          component: () => import('@/pages/teacher/ClassroomPickerPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/dashboard',
          name: 'teacher-dashboard',
          component: () => import('@/pages/shared/StaffDashboardPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/assessments',
          name: 'teacher-assessments',
          component: () => import('@/pages/shared/AssessmentsPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/assessments/:assessmentId',
          name: 'teacher-assessment-builder',
          component: () => import('@/pages/shared/AssessmentBuilderPage.vue'),
        },
        // The library is browsed globally but CLONED into a classroom, so it
        // lives under one rather than needing a target picker of its own.
        {
          path: 'classrooms/:classroomId/templates',
          name: 'teacher-template-library',
          component: () => import('@/pages/shared/AssessmentTemplatesPage.vue'),
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
      redirect: '/student/classrooms',
      beforeEnter: studentRouteGuard,
      children: [
        // Same shape as the teacher's (decision 83): the classroom is a path
        // segment, so a student's link says which class it belongs to.
        {
          path: 'classrooms',
          name: 'student-classrooms',
          component: () => import('@/pages/student/ClassroomPickerPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/dashboard',
          name: 'student-dashboard',
          component: () => import('@/pages/student/DashboardPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/practice',
          name: 'student-practice',
          component: () => import('@/pages/student/PracticePage.vue'),
        },
        {
          path: 'classrooms/:classroomId/practice/quiz',
          name: 'student-practice-quiz',
          component: () => import('@/pages/student/PracticeQuizPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/session/:sessionId',
          name: 'student-session-result',
          component: () => import('@/pages/student/SessionResultPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/assessments',
          name: 'student-assessments',
          component: () => import('@/pages/student/AssessmentsPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/assessments/:assessmentId/attempt',
          name: 'student-assessment-attempt',
          component: () => import('@/pages/student/AssessmentRunnerPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/assessments/attempts/:attemptId/result',
          name: 'student-assessment-result',
          component: () => import('@/pages/student/AssessmentResultPage.vue'),
        },
        {
          path: 'classrooms/:classroomId/statistics',
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
  // A teacher's and a student's dashboard both belong to a classroom
  // (decision 83), and which one is not known at login — the picker resolves
  // it (and skips itself when there is only one).
  if (userType === 'teacher') return '/teacher/classrooms'
  return '/student/classrooms'
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
