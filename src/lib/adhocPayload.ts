/**
 * Ad-hoc assessment question payloads — the EXACT shapes the DB write-time
 * CHECK (`assessment_payload_is_valid`) accepts and the grading trigger reads
 * (P9A-HANDOFF §2). Client validation here mirrors every DB rule so a save
 * can never raise 23514.
 */

/** All ad-hoc question types. Bank questions remain mcq | mrq | short_answer. */
export type AdhocQuestionType =
  | 'mcq'
  | 'mrq'
  | 'true_false'
  | 'numeric'
  | 'short_answer'
  | 'cloze'
  | 'matching'
  | 'ordering'
  | 'long_answer'

export interface AdhocOptionPayload {
  /** May be empty for an image-only option (the image then carries the content). */
  text: string
  /** MUST be a JSON boolean — the grader treats the string "true" as not correct. */
  is_correct: boolean
  /**
   * P10a: optional option image — a storage object path in the
   * `assessment-images` bucket (`{assessment_id}/{uuid}.webp`). Emitted only
   * when non-blank; the DB CHECK rejects `""`/blank strings.
   */
  image_path?: string | null
}

export interface MatchingItemPayload {
  id: string
  text: string
}

/**
 * P10a: every type may carry an optional question-level image (`image_path`) —
 * a storage object path in the `assessment-images` bucket. Absent or null =
 * no image; a blank string is rejected by the DB CHECK (never emitted here).
 */
interface AdhocImageCarrier {
  image_path?: string | null
}

export type AdhocPayload =
  | (AdhocImageCarrier & {
      type: 'mcq' | 'mrq'
      question: string
      options: AdhocOptionPayload[]
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'true_false'
      question: string
      answer: boolean
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'numeric'
      question: string
      answer: number
      tolerance: number
      unit?: string
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'short_answer'
      question: string
      accepted_answers: string[]
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'cloze'
      question?: string
      text: string
      blanks: { index: number; accepted: string[] }[]
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'matching'
      question: string
      left: MatchingItemPayload[]
      right: MatchingItemPayload[]
      pairs: { left_id: string; right_id: string }[]
      explanation?: string
    })
  | (AdhocImageCarrier & {
      type: 'ordering'
      question: string
      items: MatchingItemPayload[]
      correct_order: string[]
      explanation?: string
    })
  | (AdhocImageCarrier & { type: 'long_answer'; question: string; rubric?: string })

/**
 * The slice of a question that `AssessmentQuestionCard` actually renders.
 * Both surfaces that use the card satisfy it structurally: the builder's
 * `AssessmentQuestionItem` (which adds assessment/position fields) and the
 * admin bank's `BankQuestion`.
 */
export interface QuestionCardItem {
  id: string
  type: AdhocQuestionType
  question: string
  imagePath: string | null
  options: { number: number; text: string; imagePath: string | null }[]
  payload: AdhocPayload
  points: number
}

/**
 * Authoring draft — mirrors the dialog's form state. Only the fields for the
 * active `type` are read by `buildAdhocPayload`.
 */
export interface AdhocDraft {
  type: AdhocQuestionType
  question: string
  explanation: string
  /** Question-level image (storage path in `assessment-images`); null = none. */
  imagePath: string | null
  options: { text: string; isCorrect: boolean; imagePath?: string | null }[]
  trueFalseAnswer: boolean
  numericAnswer: string
  numericTolerance: string
  numericUnit: string
  acceptedAnswers: string[]
  clozeText: string
  /** Keyed by blank index found in `clozeText`; comma-separated accepted values. */
  clozeAccepted: Record<number, string>
  matchingLeft: { text: string; rightIndex: number | null }[]
  matchingRight: string[]
  /** Authored order IS the correct order. */
  orderingItems: string[]
  rubric: string
}

export type AdhocValidationCode =
  | 'questionRequired'
  | 'optionsMin'
  | 'mcqOneCorrect'
  | 'mrqCorrect'
  | 'answersRequired'
  | 'numericAnswerRequired'
  | 'toleranceInvalid'
  | 'clozeTextRequired'
  | 'clozeNoBlanks'
  | 'clozeBlankAnswersRequired'
  | 'matchingItemsRequired'
  | 'matchingPairsRequired'
  | 'orderingItemsRequired'

export type BuildAdhocResult =
  | { payload: AdhocPayload; error: null }
  | { payload: null; error: AdhocValidationCode }

export function emptyAdhocDraft(type: AdhocQuestionType = 'mcq'): AdhocDraft {
  return {
    type,
    question: '',
    explanation: '',
    imagePath: null,
    options: Array.from({ length: 4 }, () => ({ text: '', isCorrect: false, imagePath: null })),
    trueFalseAnswer: true,
    numericAnswer: '',
    numericTolerance: '',
    numericUnit: '',
    acceptedAnswers: [''],
    clozeText: '',
    clozeAccepted: {},
    matchingLeft: [
      { text: '', rightIndex: null },
      { text: '', rightIndex: null },
    ],
    matchingRight: ['', ''],
    orderingItems: ['', ''],
    rubric: '',
  }
}

/**
 * The `{{n}}` placeholders present in a cloze text, unique and ascending.
 * The DB never checks placeholders against `blanks` — this parse is what
 * keeps the authored blank list in sync with the text (P9A-HANDOFF §2).
 */
export function parseClozeIndices(text: string): number[] {
  const indices = new Set<number>()
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const index = Number.parseInt(match[1]!, 10)
    if (index >= 1) indices.add(index)
  }
  return [...indices].sort((a, b) => a - b)
}

function splitAccepted(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

const STRICT_NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/

function parseStrictNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!STRICT_NUMBER.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Build the exact DB payload from a draft, or return the first validation
 * failure. Every rule here mirrors `assessment_payload_is_valid` one-to-one;
 * anything this function returns saves without a 23514.
 */
export function buildAdhocPayload(draft: AdhocDraft): BuildAdhocResult {
  const question = draft.question.trim()
  const explanation = draft.explanation.trim()

  // Every type except cloze requires a non-empty question (cloze prompts via text).
  if (draft.type !== 'cloze' && !question) {
    return { payload: null, error: 'questionRequired' }
  }

  switch (draft.type) {
    case 'mcq':
    case 'mrq': {
      // An option counts when it has text OR an image (image-only options are
      // legal — text stays an empty string, mirroring the bank's shape).
      const kept = draft.options
        .map((option) => ({
          text: option.text.trim(),
          is_correct: option.isCorrect === true,
          imagePath: option.imagePath?.trim() || null,
        }))
        .filter((option) => option.text.length > 0 || option.imagePath !== null)
      if (kept.length < 2) return { payload: null, error: 'optionsMin' }
      const correctCount = kept.filter((option) => option.is_correct).length
      if (draft.type === 'mcq' && correctCount !== 1) {
        return { payload: null, error: 'mcqOneCorrect' }
      }
      if (draft.type === 'mrq' && correctCount === 0) {
        return { payload: null, error: 'mrqCorrect' }
      }
      const options: AdhocOptionPayload[] = kept.map((option) => ({
        text: option.text,
        is_correct: option.is_correct,
        ...(option.imagePath ? { image_path: option.imagePath } : {}),
      }))
      return {
        payload: withImage(
          withExplanation({ type: draft.type, question, options }, explanation),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'true_false':
      return {
        payload: withImage(
          withExplanation(
            { type: 'true_false', question, answer: draft.trueFalseAnswer === true },
            explanation,
          ),
          draft.imagePath,
        ),
        error: null,
      }

    case 'numeric': {
      const answer = parseStrictNumber(draft.numericAnswer)
      if (answer === null) return { payload: null, error: 'numericAnswerRequired' }
      let tolerance = 0
      if (draft.numericTolerance.trim() !== '') {
        const parsed = parseStrictNumber(draft.numericTolerance)
        if (parsed === null || parsed < 0) return { payload: null, error: 'toleranceInvalid' }
        tolerance = parsed
      }
      const unit = draft.numericUnit.trim()
      return {
        payload: withImage(
          withExplanation(
            { type: 'numeric', question, answer, tolerance, ...(unit ? { unit } : {}) },
            explanation,
          ),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'short_answer': {
      const accepted = draft.acceptedAnswers
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
      if (accepted.length === 0) return { payload: null, error: 'answersRequired' }
      return {
        payload: withImage(
          withExplanation(
            { type: 'short_answer', question, accepted_answers: accepted },
            explanation,
          ),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'cloze': {
      const text = draft.clozeText.trim()
      if (!text) return { payload: null, error: 'clozeTextRequired' }
      const indices = parseClozeIndices(text)
      if (indices.length === 0) return { payload: null, error: 'clozeNoBlanks' }
      const blanks: { index: number; accepted: string[] }[] = []
      for (const index of indices) {
        const accepted = splitAccepted(draft.clozeAccepted[index] ?? '')
        if (accepted.length === 0) return { payload: null, error: 'clozeBlankAnswersRequired' }
        blanks.push({ index, accepted })
      }
      return {
        payload: withImage(
          withExplanation(
            { type: 'cloze', ...(question ? { question } : {}), text, blanks },
            explanation,
          ),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'matching': {
      // Keep only right rows with text, remembering their original index so
      // left matches survive the filtering.
      const rightKept: { originalIndex: number; text: string }[] = []
      draft.matchingRight.forEach((text, originalIndex) => {
        const trimmed = text.trim()
        if (trimmed) rightKept.push({ originalIndex, text: trimmed })
      })
      const leftKept = draft.matchingLeft
        .map((item) => ({ text: item.text.trim(), rightIndex: item.rightIndex }))
        .filter((item) => item.text.length > 0)
      if (leftKept.length === 0 || rightKept.length === 0) {
        return { payload: null, error: 'matchingItemsRequired' }
      }

      const rightIdByOriginalIndex = new Map<number, string>()
      const right = rightKept.map((item, index) => {
        const id = `r${index + 1}`
        rightIdByOriginalIndex.set(item.originalIndex, id)
        return { id, text: item.text }
      })

      const left: MatchingItemPayload[] = []
      const pairs: { left_id: string; right_id: string }[] = []
      for (const [index, item] of leftKept.entries()) {
        const id = `l${index + 1}`
        const rightId =
          item.rightIndex === null ? undefined : rightIdByOriginalIndex.get(item.rightIndex)
        // The DB requires EXACTLY one pair per left item.
        if (!rightId) return { payload: null, error: 'matchingPairsRequired' }
        left.push({ id, text: item.text })
        pairs.push({ left_id: id, right_id: rightId })
      }

      return {
        payload: withImage(
          withExplanation({ type: 'matching', question, left, right, pairs }, explanation),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'ordering': {
      const kept = draft.orderingItems.map((text) => text.trim()).filter((text) => text.length > 0)
      if (kept.length < 2) return { payload: null, error: 'orderingItemsRequired' }
      const items = kept.map((text, index) => ({ id: `i${index + 1}`, text }))
      return {
        payload: withImage(
          withExplanation(
            { type: 'ordering', question, items, correct_order: items.map((item) => item.id) },
            explanation,
          ),
          draft.imagePath,
        ),
        error: null,
      }
    }

    case 'long_answer': {
      const rubric = draft.rubric.trim()
      return {
        payload: withImage(
          { type: 'long_answer', question, ...(rubric ? { rubric } : {}) },
          draft.imagePath,
        ),
        error: null,
      }
    }
  }
}

function withExplanation<T extends AdhocPayload>(payload: T, explanation: string): T {
  return explanation ? { ...payload, explanation } : payload
}

/**
 * Attach the question-level image. Blank/null paths never emit the key —
 * the DB CHECK rejects `""`/whitespace-only `image_path` values (23514).
 */
function withImage<T extends AdhocPayload>(payload: T, imagePath: string | null): T {
  const trimmed = imagePath?.trim()
  return trimmed ? { ...payload, image_path: trimmed } : payload
}

/**
 * Edit round-trip: rebuild the dialog draft from a stored payload. Malformed
 * or partial payloads degrade to empty fields rather than throwing.
 */
export function payloadToDraft(payload: AdhocPayload): AdhocDraft {
  const draft = emptyAdhocDraft(payload.type)
  draft.question = 'question' in payload ? (payload.question ?? '') : ''
  if ('explanation' in payload && payload.explanation) draft.explanation = payload.explanation
  draft.imagePath = payload.image_path ?? null

  switch (payload.type) {
    case 'mcq':
    case 'mrq':
      draft.options =
        payload.options.length > 0
          ? payload.options.map((option) => ({
              text: option.text,
              isCorrect: option.is_correct === true,
              imagePath: option.image_path ?? null,
            }))
          : draft.options
      break
    case 'true_false':
      draft.trueFalseAnswer = payload.answer === true
      break
    case 'numeric':
      draft.numericAnswer = String(payload.answer)
      draft.numericTolerance = payload.tolerance > 0 ? String(payload.tolerance) : ''
      draft.numericUnit = payload.unit ?? ''
      break
    case 'short_answer':
      draft.acceptedAnswers =
        payload.accepted_answers.length > 0 ? [...payload.accepted_answers] : ['']
      break
    case 'cloze':
      draft.clozeText = payload.text
      draft.clozeAccepted = Object.fromEntries(
        payload.blanks.map((blank) => [blank.index, blank.accepted.join(', ')]),
      )
      break
    case 'matching': {
      const rightIndexById = new Map(payload.right.map((item, index) => [item.id, index]))
      const rightIdByLeftId = new Map(payload.pairs.map((pair) => [pair.left_id, pair.right_id]))
      draft.matchingRight = payload.right.map((item) => item.text)
      draft.matchingLeft = payload.left.map((item) => {
        const rightId = rightIdByLeftId.get(item.id)
        return {
          text: item.text,
          rightIndex: rightId !== undefined ? (rightIndexById.get(rightId) ?? null) : null,
        }
      })
      break
    }
    case 'ordering': {
      const textById = new Map(payload.items.map((item) => [item.id, item.text]))
      const ordered = payload.correct_order
        .map((id) => textById.get(id))
        .filter((text): text is string => text !== undefined)
      draft.orderingItems = ordered.length > 0 ? ordered : payload.items.map((item) => item.text)
      break
    }
    case 'long_answer':
      draft.rubric = payload.rubric ?? ''
      break
  }

  return draft
}

/** The display prompt for a payload — cloze may omit `question` and prompt via `text`. */
export function payloadPrompt(payload: AdhocPayload): string {
  if (payload.type === 'cloze') return payload.question?.trim() || payload.text
  return payload.question
}

/**
 * Every storage object path a payload references (decision 78): the
 * question-level image plus, for mcq/mrq, each option image. Blank/absent
 * paths are skipped. Used to clean up `assessment-images` objects when an
 * ad-hoc question is deleted and to confirm replaced images are unreferenced.
 */
export function collectAdhocPayloadImagePaths(payload: AdhocPayload): string[] {
  const paths: string[] = []
  if (payload.image_path?.trim()) paths.push(payload.image_path)
  if (payload.type === 'mcq' || payload.type === 'mrq') {
    for (const option of payload.options) {
      if (option.image_path?.trim()) paths.push(option.image_path)
    }
  }
  return paths
}

/** Display fields derived from an ad-hoc payload (list rows, result dialogs). */
export function adhocDisplayFields(payload: AdhocPayload): {
  type: AdhocQuestionType
  question: string
  imagePath: string | null
  options: { number: number; text: string; imagePath: string | null }[]
} {
  return {
    type: payload.type ?? 'mcq',
    question: payloadPrompt(payload) ?? '',
    imagePath: payload.image_path ?? null,
    options:
      payload.type === 'mcq' || payload.type === 'mrq'
        ? payload.options.map((option, index) => ({
            number: index + 1,
            text: option.text,
            imagePath: option.image_path ?? null,
          }))
        : [],
  }
}
