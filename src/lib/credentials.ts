/**
 * Credential helpers for hierarchical account provisioning.
 *
 * Students are handed their login by a teacher, so passwords are generated
 * here rather than chosen by the account holder.
 */

// Ambiguous glyphs (0/O, 1/l/I) are excluded so credentials survive being
// read off a screen and typed by a child.
const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const PASSWORD_LENGTH = 10

/** Generate a random, unambiguous password that satisfies the 8-char minimum. */
export function generatePassword(): string {
  const bytes = new Uint32Array(PASSWORD_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}
