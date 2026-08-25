import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAssessmentsStore } from '@/stores/assessments'
import { useStudentAssessmentsStore } from '@/stores/student-assessments'
import { useClassroomStudentStore } from '@/stores/classroom-student'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useT } from '@/composables/useT'

export interface Crumb {
  label: string
  /** Omitted for the last crumb, which is the current page. */
  to?: string
}

/**
 * Route name -> the sidebar nav key naming that section. Reuses the nav
 * labels rather than a second vocabulary, so a section is worded identically
 * in the sidebar and in the trail.
 */
const SECTION_KEY: Record<string, string> = {
  'admin-dashboard': 'dashboard',
  'admin-curriculum': 'curriculum',
  'admin-assessment-templates': 'assessmentTemplates',
  'admin-assessment-template-builder': 'assessmentTemplates',
  'admin-tags': 'learningPoints',
  'admin-organizations': 'organizations',
  'manager-dashboard': 'dashboard',
  'manager-teachers': 'teachers',
  'manager-students': 'students',
  'manager-classrooms': 'classrooms',
  'manager-classroom-dashboard': 'dashboard',
  // A student is reached from the classroom dashboard's roster, so that is the
  // section they belong under.
  'manager-classroom-student': 'dashboard',
  'manager-classroom-assessments': 'assessments',
  'manager-classroom-assessment-builder': 'assessments',
  'teacher-dashboard': 'dashboard',
  'teacher-assessments': 'assessments',
  'teacher-assessment-builder': 'assessments',
  'teacher-template-library': 'templateLibrary',
  'student-dashboard': 'dashboard',
  'student-practice': 'practice',
  'student-practice-quiz': 'practice',
  'student-session-result': 'practice',
  'student-assessments': 'assessments',
  'student-assessment-attempt': 'assessments',
  'student-assessment-result': 'assessments',
  'student-statistics': 'statistics',
}

/** Routes whose section crumb should link back to the section index. */
const SECTION_PATH: Record<string, string> = {
  'admin-assessment-template-builder': 'assessments',
  'manager-classroom-assessment-builder': 'assessments',
  'manager-classroom-student': 'dashboard',
  'teacher-assessment-builder': 'assessments',
  'student-practice-quiz': 'practice',
  'student-session-result': 'practice',
  'student-assessment-attempt': 'assessments',
  'student-assessment-result': 'assessments',
}

/**
 * The trail shown in the header, replacing the per-page title block
 * (decision 84). It is derived from the route, so it always agrees with the
 * address bar.
 *
 * It deliberately does NOT lead with `Classes > <class name>`: the sidebar
 * switcher sits directly beside it and already names the active classroom, so
 * those two crumbs were duplication that pushed the part you actually need —
 * the section and the entity — off to the right.
 */
export function useBreadcrumbs() {
  const t = useT()
  const route = useRoute()
  const authStore = useAuthStore()
  const assessmentsStore = useAssessmentsStore()
  const studentAssessmentsStore = useStudentAssessmentsStore()
  const classroomStudentStore = useClassroomStudentStore()
  const { classroomId, basePath } = useActiveClassroom()

  const crumbs = computed<Crumb[]>(() => {
    const role = authStore.userType
    if (!role) return []

    const name = String(route.name ?? '')
    const nav = t.value.shared.layout.sidebar.nav as Record<string, Record<string, string>>
    const roleNav = nav[role] ?? {}
    const leaves = t.value.shared.breadcrumbs
    const trail: Crumb[] = []

    // Profile sits outside every section.
    if (name.endsWith('-profile')) return [{ label: leaves.profile }]

    // The class picker is the root of a classroom-scoped role.
    if (name.endsWith('-classrooms') && !classroomId.value) {
      return [{ label: roleNav.classrooms ?? leaves.classrooms }]
    }

    const sectionKey = SECTION_KEY[name]
    if (sectionKey) {
      const sectionPath = SECTION_PATH[name]
      trail.push({
        label: roleNav[sectionKey] ?? sectionKey,
        to: sectionPath ? `${basePath.value}/${sectionPath}` : undefined,
      })
    }

    // Leaf: the entity being viewed, or what is being done to it.
    if (name.endsWith('assessment-builder') || name === 'admin-assessment-template-builder') {
      const title = assessmentsStore.currentAssessment?.title
      if (title) trail.push({ label: title })
    } else if (name === 'manager-classroom-student') {
      const studentName = classroomStudentStore.student?.name
      if (studentName) trail.push({ label: studentName })
    } else if (name === 'student-practice-quiz') {
      trail.push({ label: leaves.quiz })
    } else if (name === 'student-session-result') {
      trail.push({ label: leaves.sessionResult })
    } else if (name === 'student-assessment-attempt') {
      // Name the assessment being attempted rather than a generic "Attempt" —
      // it is the only place the student can see which one they are in.
      trail.push({ label: studentAssessmentsStore.activeAttempt?.title || leaves.attempt })
    } else if (name === 'student-assessment-result') {
      trail.push({ label: studentAssessmentsStore.review?.title || leaves.result })
    }

    // The last crumb IS the current page — never a link.
    const last = trail[trail.length - 1]
    if (last) delete last.to
    return trail
  })

  return { crumbs }
}
