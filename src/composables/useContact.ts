import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

export interface ContactMessagePayload {
  name: string
  email: string
  subject: string
  message: string
  source: 'landing' | 'app'
  priority?: boolean
}

/**
 * Wraps the `send-contact-email` Edge Function invocation so both the landing
 * form (`ContactSection.vue`) and the in-app form (`ContactPage.vue`) share one
 * code path. Owns `isSubmitting`; callers keep their own localized toast copy and
 * branch on the returned `error`.
 */
export function useContact() {
  const isSubmitting = ref(false)

  async function sendContactMessage(
    payload: ContactMessagePayload,
  ): Promise<{ error: string | null }> {
    isSubmitting.value = true
    try {
      const { error } = await supabase.functions.invoke('send-contact-email', {
        body: payload,
      })
      if (error) throw error
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    } finally {
      isSubmitting.value = false
    }
  }

  return { isSubmitting, sendContactMessage }
}
