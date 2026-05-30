import type { ClassValue } from 'clsx'
import type { Ref } from 'vue'
import type { Updater } from '@tanstack/vue-table'
import { clsx } from 'clsx'
import { isFunction } from '@tanstack/vue-table'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function valueUpdater<T>(updaterOrValue: Updater<T>, ref: Ref<T>) {
  ref.value = isFunction(updaterOrValue) ? updaterOrValue(ref.value) : updaterOrValue
}

/** Extract initials from a name (e.g. "John Doe" → "JD") */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'] as const

export function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function getScoreTextColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

/**
 * Parses simple markdown to HTML.
 * Supports: **bold**, *italic*, `- ` unordered lists, and newlines.
 * Escapes HTML to prevent XSS.
 */
export function parseSimpleMarkdown(text: string): string {
  // Escape HTML first to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // Process lines to handle list items
  const lines = escaped.split('\n')
  const output: string[] = []
  let inList = false

  for (const line of lines) {
    const listMatch = line.match(/^- (.+)$/)
    if (listMatch) {
      if (!inList) {
        output.push('<ul class="my-2 ml-4 list-disc space-y-1">')
        inList = true
      }
      output.push(`<li>${listMatch[1]}</li>`)
    } else {
      if (inList) {
        output.push('</ul>')
        inList = false
      }
      output.push(line)
    }
  }
  if (inList) output.push('</ul>')

  // Join non-list lines with <br>, but don't add <br> around <ul>/<li> tags
  let result = output
    .join('\n')
    .replace(/\n(?!<\/?[uo]l>|<\/?li>)/g, '<br>')
    .replace(/\n/g, '')

  // Convert **bold** to <strong>
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Convert *italic* to <em> (but not inside **)
  result = result.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')

  // Convert __underline__ to <u> (uses _ boundaries to avoid greedy matches)
  result = result.replace(/(?<!_)__([^_]+?)__(?!_)/g, '<u>$1</u>')

  return result
}
