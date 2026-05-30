import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { getStorageImageUrl } from '@/lib/storage'
import { toMYTDateString, getMYTDayOfWeek, mytDateToUTCDate, utcDateToString } from '@/lib/date'
import type { Database } from '@/types/database.types'
import { useLanguageStore } from '@/stores/language'

type PetRarity = Database['public']['Enums']['pet_rarity']

export interface StudentProfileData {
  coins: number
  xp: number
  currentStreak: number
  memberSince: string | null
}

export interface StudentPetData {
  name: string
  rarity: PetRarity
  imagePath: string
  tier2ImagePath: string | null
  tier3ImagePath: string | null
  tier: number
  imageUrl: string
}

export interface SubjectStats {
  gradeLevelName: string
  subjectName: string
  averageScore: number
}

export interface WeekDay {
  label: string
  active: boolean
  isToday: boolean
  isFuture: boolean
}

export function useStudentProfileDialog() {
  const languageStore = useLanguageStore()
  const profile = ref<StudentProfileData | null>(null)
  const pet = ref<StudentPetData | null>(null)
  const bestSubjects = ref<SubjectStats[]>([])
  const weeklyActivity = ref<WeekDay[]>([])
  const isLoading = ref(false)

  // Request token: guards against out-of-order resolution when fetchProfile is
  // invoked twice in quick succession with different studentIds (same shared refs).
  let seq = 0

  async function fetchProfile(studentId: string) {
    const version = ++seq
    isLoading.value = true
    profile.value = null
    pet.value = null
    bestSubjects.value = []
    weeklyActivity.value = []

    try {
      const { data, error } = await supabase.rpc('get_student_profile_for_dialog', {
        p_student_id: studentId,
      })

      // Bail if a newer fetch superseded this one while awaiting.
      if (version !== seq) return

      if (error) throw error
      if (!data) return

      // types regen pending: 20260529_audit_remediation (xp + current_streak added to RPC payload)
      const result = data as {
        coins: number
        xp: number
        current_streak: number
        member_since: string | null
        pet: {
          name: string
          rarity: PetRarity
          image_path: string
          tier2_image_path: string | null
          tier3_image_path: string | null
          tier: number
        } | null
        best_subjects: {
          grade_level_name: string
          subject_name: string
          average_score: number
        }[]
        weekly_activity_dates: string[]
      }

      // Profile
      profile.value = {
        coins: result.coins,
        xp: result.xp ?? 0,
        currentStreak: result.current_streak ?? 0,
        memberSince: result.member_since,
      }

      // Pet
      if (result.pet) {
        const petData = result.pet
        const tier = petData.tier

        // Pick image path based on tier
        let imagePath = petData.image_path
        if (tier === 2 && petData.tier2_image_path) {
          imagePath = petData.tier2_image_path
        } else if (tier === 3 && petData.tier3_image_path) {
          imagePath = petData.tier3_image_path
        }

        const imageUrl = getStorageImageUrl('pet-images', imagePath)

        pet.value = {
          name: petData.name,
          rarity: petData.rarity,
          imagePath: petData.image_path,
          tier2ImagePath: petData.tier2_image_path,
          tier3ImagePath: petData.tier3_image_path,
          tier,
          imageUrl,
        }
      }

      // Best subjects
      bestSubjects.value = result.best_subjects.map((s) => ({
        gradeLevelName: s.grade_level_name,
        subjectName: s.subject_name,
        averageScore: s.average_score,
      }))

      // Weekly activity: build 7-day array (Mon-Sun) from active dates
      const activeDateStrs = new Set(result.weekly_activity_dates)
      const weekDayLabels = languageStore.t.shared.studentProfileDialog.weekDayLabels
      const todayStr = toMYTDateString()
      const dayOfWeek = getMYTDayOfWeek() // 0=Sun, 1=Mon...
      const todayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const todayUTC = mytDateToUTCDate(todayStr)
      const monday = new Date(todayUTC)
      monday.setUTCDate(todayUTC.getUTCDate() + mondayOffset)

      weeklyActivity.value = weekDayLabels.map((label, i) => {
        const d = new Date(monday)
        d.setUTCDate(monday.getUTCDate() + i)
        const dateStr = utcDateToString(d)
        return {
          label,
          active: activeDateStrs.has(dateStr),
          isToday: i === todayIndex,
          isFuture: i > todayIndex,
        }
      })
    } catch (err) {
      if (version === seq) console.error('Failed to fetch student profile:', err)
    } finally {
      if (version === seq) isLoading.value = false
    }
  }

  return {
    profile,
    pet,
    bestSubjects,
    weeklyActivity,
    isLoading,
    fetchProfile,
  }
}
