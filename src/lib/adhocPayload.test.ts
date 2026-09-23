import { describe, expect, it } from 'vitest'
import {
  buildAdhocPayload,
  emptyAdhocDraft,
  parseClozeIndices,
  payloadToDraft,
  payloadPrompt,
  type AdhocDraft,
  type AdhocPayload,
} from './adhocPayload'

function draft(overrides: Partial<AdhocDraft>): AdhocDraft {
  return { ...emptyAdhocDraft(overrides.type ?? 'mcq'), ...overrides }
}

describe('parseClozeIndices', () => {
  it('extracts unique ascending indices', () => {
    expect(parseClozeIndices('a {{2}} b {{1}} c {{2}} d')).toEqual([1, 2])
  })

  it('ignores non-placeholder braces and index 0', () => {
    expect(parseClozeIndices('{{0}} {{x}} {1} plain')).toEqual([])
  })
})

describe('buildAdhocPayload', () => {
  it('requires a question for every type except cloze', () => {
    expect(buildAdhocPayload(draft({ type: 'true_false', question: '  ' })).error).toBe(
      'questionRequired',
    )
    const cloze = buildAdhocPayload(
      draft({ type: 'cloze', question: '', clozeText: '1+{{1}}=2', clozeAccepted: { 1: '1' } }),
    )
    expect(cloze.error).toBeNull()
    expect(cloze.payload).toEqual({
      type: 'cloze',
      text: '1+{{1}}=2',
      blanks: [{ index: 1, accepted: ['1'] }],
    })
  })

  it('builds mcq with >=2 options and exactly one correct', () => {
    const base = draft({
      type: 'mcq',
      question: 'Q',
      options: [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: true },
        { text: '  ', isCorrect: false },
      ],
    })
    const result = buildAdhocPayload(base)
    expect(result.payload).toEqual({
      type: 'mcq',
      question: 'Q',
      options: [
        { text: 'a', is_correct: false },
        { text: 'b', is_correct: true },
      ],
    })
    expect(buildAdhocPayload({ ...base, options: [{ text: 'a', isCorrect: true }] }).error).toBe(
      'optionsMin',
    )
    expect(
      buildAdhocPayload({
        ...base,
        options: [
          { text: 'a', isCorrect: true },
          { text: 'b', isCorrect: true },
        ],
      }).error,
    ).toBe('mcqOneCorrect')
  })

  it('requires at least one correct mrq option', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'mrq',
        question: 'Q',
        options: [
          { text: 'a', isCorrect: false },
          { text: 'b', isCorrect: false },
        ],
      }),
    )
    expect(result.error).toBe('mrqCorrect')
  })

  it('builds true_false with a real boolean answer', () => {
    const result = buildAdhocPayload(
      draft({ type: 'true_false', question: 'Q', trueFalseAnswer: false }),
    )
    expect(result.payload).toEqual({ type: 'true_false', question: 'Q', answer: false })
  })

  it('builds numeric with defaulted tolerance and optional unit', () => {
    expect(
      buildAdhocPayload(
        draft({ type: 'numeric', question: 'Q', numericAnswer: '29', numericUnit: ' cm ' }),
      ).payload,
    ).toEqual({ type: 'numeric', question: 'Q', answer: 29, tolerance: 0, unit: 'cm' })
    expect(
      buildAdhocPayload(
        draft({ type: 'numeric', question: 'Q', numericAnswer: '1.5e2', numericTolerance: '0.5' }),
      ).payload,
    ).toEqual({ type: 'numeric', question: 'Q', answer: 150, tolerance: 0.5 })
  })

  it('rejects non-numeric answers and negative tolerance', () => {
    expect(
      buildAdhocPayload(draft({ type: 'numeric', question: 'Q', numericAnswer: 'about 20' })).error,
    ).toBe('numericAnswerRequired')
    expect(
      buildAdhocPayload(
        draft({ type: 'numeric', question: 'Q', numericAnswer: '1', numericTolerance: '-1' }),
      ).error,
    ).toBe('toleranceInvalid')
  })

  it('builds short_answer as accepted_answers, never a single answer key', () => {
    const result = buildAdhocPayload(
      draft({ type: 'short_answer', question: 'Q', acceptedAnswers: [' triangle ', '', '三角形'] }),
    )
    expect(result.payload).toEqual({
      type: 'short_answer',
      question: 'Q',
      accepted_answers: ['triangle', '三角形'],
    })
    expect(result.payload && 'answer' in result.payload).toBe(false)
    expect(
      buildAdhocPayload(draft({ type: 'short_answer', question: 'Q', acceptedAnswers: [' '] }))
        .error,
    ).toBe('answersRequired')
  })

  it('keeps cloze blanks in sync with the text placeholders', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'cloze',
        question: 'Fill it in',
        clozeText: '5 + {{1}} = 12 and {{3}}',
        clozeAccepted: { 1: '7, seven', 2: 'stale', 3: 'even' },
      }),
    )
    expect(result.payload).toEqual({
      type: 'cloze',
      question: 'Fill it in',
      text: '5 + {{1}} = 12 and {{3}}',
      blanks: [
        { index: 1, accepted: ['7', 'seven'] },
        { index: 3, accepted: ['even'] },
      ],
    })
  })

  it('rejects cloze without placeholders or blank answers', () => {
    expect(buildAdhocPayload(draft({ type: 'cloze', clozeText: 'no blanks here' })).error).toBe(
      'clozeNoBlanks',
    )
    expect(buildAdhocPayload(draft({ type: 'cloze', clozeText: ' ' })).error).toBe(
      'clozeTextRequired',
    )
    expect(
      buildAdhocPayload(
        draft({ type: 'cloze', clozeText: '{{1}} and {{2}}', clozeAccepted: { 1: 'a' } }),
      ).error,
    ).toBe('clozeBlankAnswersRequired')
  })

  it('builds matching with one pair per left item and reusable/distractor rights', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'matching',
        question: 'Match',
        matchingLeft: [
          { text: '6 + 6', rightIndex: 1 },
          { text: '', rightIndex: null },
          { text: '10 + 5', rightIndex: 0 },
        ],
        matchingRight: ['15', '12', '18'],
      }),
    )
    expect(result.payload).toEqual({
      type: 'matching',
      question: 'Match',
      left: [
        { id: 'l1', text: '6 + 6' },
        { id: 'l2', text: '10 + 5' },
      ],
      right: [
        { id: 'r1', text: '15' },
        { id: 'r2', text: '12' },
        { id: 'r3', text: '18' },
      ],
      pairs: [
        { left_id: 'l1', right_id: 'r2' },
        { left_id: 'l2', right_id: 'r1' },
      ],
    })
  })

  it('re-anchors matching pairs when empty right rows are filtered out', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'matching',
        question: 'Match',
        matchingLeft: [{ text: 'a', rightIndex: 2 }],
        matchingRight: ['', 'x', 'y'],
      }),
    )
    expect(result.payload).toMatchObject({
      right: [
        { id: 'r1', text: 'x' },
        { id: 'r2', text: 'y' },
      ],
      pairs: [{ left_id: 'l1', right_id: 'r2' }],
    })
  })

  it('rejects matching with a left item missing its match', () => {
    expect(
      buildAdhocPayload(
        draft({
          type: 'matching',
          question: 'Match',
          matchingLeft: [{ text: 'a', rightIndex: null }],
          matchingRight: ['x'],
        }),
      ).error,
    ).toBe('matchingPairsRequired')
    expect(
      buildAdhocPayload(
        draft({
          type: 'matching',
          question: 'Match',
          matchingLeft: [{ text: 'a', rightIndex: 0 }],
          matchingRight: [' '],
        }),
      ).error,
    ).toBe('matchingItemsRequired')
  })

  it('builds ordering where the authored order IS the key', () => {
    const result = buildAdhocPayload(
      draft({ type: 'ordering', question: 'Q', orderingItems: ['9', '', '18', '27'] }),
    )
    expect(result.payload).toEqual({
      type: 'ordering',
      question: 'Q',
      items: [
        { id: 'i1', text: '9' },
        { id: 'i2', text: '18' },
        { id: 'i3', text: '27' },
      ],
      correct_order: ['i1', 'i2', 'i3'],
    })
    expect(
      buildAdhocPayload(draft({ type: 'ordering', question: 'Q', orderingItems: ['only'] })).error,
    ).toBe('orderingItemsRequired')
  })

  it('builds long_answer with optional rubric and no explanation slot', () => {
    expect(
      buildAdhocPayload(
        draft({ type: 'long_answer', question: 'Explain.', rubric: ' 5 pts ', explanation: 'x' }),
      ).payload,
    ).toEqual({ type: 'long_answer', question: 'Explain.', rubric: '5 pts' })
    expect(buildAdhocPayload(draft({ type: 'long_answer', question: 'Explain.' })).payload).toEqual(
      { type: 'long_answer', question: 'Explain.' },
    )
  })

  it('appends explanation only when non-empty', () => {
    const result = buildAdhocPayload(
      draft({ type: 'true_false', question: 'Q', explanation: ' why ' }),
    )
    expect(result.payload).toEqual({
      type: 'true_false',
      question: 'Q',
      answer: true,
      explanation: 'why',
    })
  })

  it('emits a question image_path only when non-blank (every type)', () => {
    const withImage = buildAdhocPayload(
      draft({ type: 'true_false', question: 'Q', imagePath: ' a1/pic.webp ' }),
    )
    expect(withImage.payload).toEqual({
      type: 'true_false',
      question: 'Q',
      answer: true,
      image_path: 'a1/pic.webp',
    })

    // Blank/null paths never emit the key — the DB CHECK rejects "".
    const blank = buildAdhocPayload(draft({ type: 'long_answer', question: 'Q', imagePath: '  ' }))
    expect(blank.payload).toEqual({ type: 'long_answer', question: 'Q' })
    const none = buildAdhocPayload(draft({ type: 'long_answer', question: 'Q', imagePath: null }))
    expect(none.payload).toEqual({ type: 'long_answer', question: 'Q' })
  })

  it('keeps image-only options and emits per-option image_path', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'mcq',
        question: 'Q',
        options: [
          { text: '', isCorrect: true, imagePath: 'a1/o1.webp' },
          { text: 'b', isCorrect: false, imagePath: null },
          { text: '  ', isCorrect: false }, // no text, no image → dropped
        ],
      }),
    )
    expect(result.error).toBeNull()
    expect(result.payload).toEqual({
      type: 'mcq',
      question: 'Q',
      options: [
        { text: '', is_correct: true, image_path: 'a1/o1.webp' },
        { text: 'b', is_correct: false },
      ],
    })
  })

  it('still requires 2 countable options when images are absent', () => {
    const result = buildAdhocPayload(
      draft({
        type: 'mcq',
        question: 'Q',
        options: [
          { text: 'a', isCorrect: true },
          { text: ' ', isCorrect: false, imagePath: '   ' },
        ],
      }),
    )
    expect(result.error).toBe('optionsMin')
  })
})

describe('payloadToDraft round-trips', () => {
  it('round-trips every type through build', () => {
    const payloads: AdhocPayload[] = [
      {
        type: 'mrq',
        question: 'Q',
        options: [
          { text: 'a', is_correct: true },
          { text: 'b', is_correct: false },
        ],
        explanation: 'because',
      },
      { type: 'true_false', question: 'Q', answer: false },
      { type: 'numeric', question: 'Q', answer: 29, tolerance: 0.5, unit: 'cm' },
      { type: 'short_answer', question: 'Q', accepted_answers: ['triangle', '三角形'] },
      {
        type: 'cloze',
        text: '{{1}} and {{2}}',
        blanks: [
          { index: 1, accepted: ['7', 'seven'] },
          { index: 2, accepted: ['8'] },
        ],
      },
      {
        type: 'matching',
        question: 'Q',
        left: [
          { id: 'l1', text: 'A' },
          { id: 'l2', text: 'B' },
        ],
        right: [
          { id: 'r1', text: '1' },
          { id: 'r2', text: '2' },
        ],
        pairs: [
          { left_id: 'l1', right_id: 'r2' },
          { left_id: 'l2', right_id: 'r1' },
        ],
      },
      {
        type: 'ordering',
        question: 'Q',
        items: [
          { id: 'i1', text: 'first' },
          { id: 'i2', text: 'second' },
        ],
        correct_order: ['i2', 'i1'],
      },
      { type: 'long_answer', question: 'Q', rubric: 'r' },
    ]

    for (const payload of payloads) {
      const rebuilt = buildAdhocPayload(payloadToDraft(payload))
      expect(rebuilt.error).toBeNull()
      if (payload.type === 'ordering') {
        // Ordering ids are regenerated; the texts must come back in key order.
        expect(rebuilt.payload).toEqual({
          type: 'ordering',
          question: 'Q',
          items: [
            { id: 'i1', text: 'second' },
            { id: 'i2', text: 'first' },
          ],
          correct_order: ['i1', 'i2'],
        })
      } else {
        expect(rebuilt.payload).toEqual(payload)
      }
    }
  })

  it('round-trips question and option images', () => {
    const payload: AdhocPayload = {
      type: 'mcq',
      question: 'Q',
      image_path: 'a1/q.webp',
      options: [
        { text: '', is_correct: true, image_path: 'a1/o1.webp' },
        { text: 'b', is_correct: false },
      ],
    }
    const rebuilt = buildAdhocPayload(payloadToDraft(payload))
    expect(rebuilt.error).toBeNull()
    expect(rebuilt.payload).toEqual(payload)

    // A stored JSON null degrades to "no image" on both levels.
    const withNulls: AdhocPayload = {
      type: 'mcq',
      question: 'Q',
      image_path: null,
      options: [
        { text: 'a', is_correct: true, image_path: null },
        { text: 'b', is_correct: false },
      ],
    }
    const rebuiltNulls = buildAdhocPayload(payloadToDraft(withNulls))
    expect(rebuiltNulls.payload).toEqual({
      type: 'mcq',
      question: 'Q',
      options: [
        { text: 'a', is_correct: true },
        { text: 'b', is_correct: false },
      ],
    })
  })
})

describe('payloadPrompt', () => {
  it('falls back to cloze text when the optional prompt is absent', () => {
    expect(
      payloadPrompt({ type: 'cloze', text: 'a {{1}}', blanks: [{ index: 1, accepted: ['x'] }] }),
    ).toBe('a {{1}}')
    expect(payloadPrompt({ type: 'true_false', question: 'Q', answer: true })).toBe('Q')
  })
})
