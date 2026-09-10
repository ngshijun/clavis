import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import {
  useAssessmentBankStore,
  type BankQuestion,
  type BankQuestionPatch,
  type QuestionDifficulty,
} from '@/stores/assessment-bank'
import { adhocDisplayFields, type AdhocPayload, type QuestionCardItem } from '@/lib/adhocPayload'
import { specToJson, type GenerationLine, type GenerationShortfall } from '@/lib/generationSpec'
import type { Database, Json } from '@/types/database.types'

type AssessmentStatus = Database['public']['Enums']['assessment_status']

/** A grade+subject a paper covers, derived from the items it holds. */
export interface PaperPairing {
  gradeLevelId: string
  subjectId: string
}

export interface Paper {
  id: string
  /** NULL = the platform's paper (admin-authored); set = that center's own. */
  organizationId: string | null
  title: string
  description: string | null
  status: AssessmentStatus
  /** True when the paper was generated, so single items can be re-rolled. */
  isGenerated: boolean
  timeLimitSeconds: number | null
  shuffleQuestions: boolean
  createdBy: string
  itemCount: number
  /** Empty for a paper with no items yet — it covers nothing so far. */
  pairings: PaperPairing[]
  createdAt: string
  updatedAt: string
}

/**
 * An item as it sits in a paper: the bank row, its position, and the display
 * slice the shared question card renders.
 */
export interface PaperItem extends BankQuestion, QuestionCardItem {
  position: number
  /** Which spec line drew it, or null when it was picked or written by hand. */
  generationLine: number | null
}

const PAPER_SELECT = `
  id, organization_id, title, description, status, spec,
  time_limit_seconds, shuffle_questions, created_by, created_at, updated_at,
  paper_items (count)
`

interface PaperRow {
  id: string
  organization_id: string | null
  title: string
  description: string | null
  status: AssessmentStatus
  spec: Json | null
  time_limit_seconds: number | null
  shuffle_questions: boolean
  created_by: string
  created_at: string
  updated_at: string
  paper_items: { count: number }[]
}

function rowToPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    status: row.status,
    isGenerated: row.spec !== null,
    timeLimitSeconds: row.time_limit_seconds,
    shuffleQuestions: row.shuffle_questions,
    createdBy: row.created_by,
    itemCount: row.paper_items[0]?.count ?? 0,
    pairings: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type PaperItemRow = Database['public']['Functions']['get_paper_items']['Returns'][number]

function rowToPaperItem(row: PaperItemRow): PaperItem {
  const payload = row.payload as unknown as AdhocPayload
  return {
    id: row.id,
    position: row.position,
    payload,
    ...adhocDisplayFields(payload),
    difficulty: row.difficulty,
    subTopicId: row.sub_topic_id,
    organizationId: row.organization_id,
    points: Number(row.points),
    tagIds: row.tag_ids,
    generationLine: row.generation_line,
    usedInPapers: 0,
    createdAt: '',
  }
}

/**
 * Papers (decision 91): the one library layer. A paper is a title, a status,
 * the delivery settings a classroom inherits, optionally the SPEC it was
 * generated from — and an ordered list of REFERENCES into the item bank. It
 * holds no question content of its own and is never attempted.
 *
 * `organizationId` decides who owns it: NULL = the platform's, authored by an
 * admin and offered to every center that teaches a grade+subject it covers;
 * set = that center's own, visible to its staff alone. The same builder edits
 * both, because editing a paper is editing a paper either way.
 *
 * Editing an item inside a paper edits the BANK row, and therefore every
 * paper holding it: the item writes below go through the bank store and patch
 * this store's local rows.
 */
export const usePapersStore = defineStore('papers', () => {
  const authStore = useAuthStore()
  const bankStore = useAssessmentBankStore()

  /** The papers the caller may edit: the platform's, or their center's. */
  const ownPapers = ref<Paper[]>([])
  /** Published platform papers a center may adopt or deliver. Empty for admins. */
  const libraryPapers = ref<Paper[]>([])
  const isLoading = ref(false)

  const currentPaper = ref<Paper | null>(null)
  const currentItems = ref<PaperItem[]>([])
  const isLoadingCurrent = ref(false)

  /** NULL for an admin (the platform library), the caller's center for staff. */
  function ownerOrgId(): string | null {
    return authStore.isAdmin ? null : authStore.organizationId
  }

  /**
   * A paper stores no grade+subject — its items decide it — so the pairings
   * come from the DB, which can see the items of a platform paper the caller
   * may read but may not open in the bank.
   */
  async function attachPairings(papers: Paper[]): Promise<void> {
    if (papers.length === 0) return
    const { data, error: rpcError } = await supabase.rpc('get_paper_pairings')
    if (rpcError) throw rpcError

    const byPaper = new Map<string, PaperPairing[]>()
    for (const row of data ?? []) {
      const list = byPaper.get(row.paper_id) ?? []
      list.push({ gradeLevelId: row.grade_level_id, subjectId: row.subject_id })
      byPaper.set(row.paper_id, list)
    }
    for (const paper of papers) paper.pairings = byPaper.get(paper.id) ?? []
  }

  async function fetchOwnPapers(): Promise<{ error: string | null }> {
    isLoading.value = true
    try {
      const orgId = ownerOrgId()
      let query = supabase.from('papers').select(PAPER_SELECT)
      query =
        orgId === null ? query.is('organization_id', null) : query.eq('organization_id', orgId)

      const { data, error: fetchError } = await query.order('updated_at', { ascending: false })
      if (fetchError) throw fetchError

      const papers = ((data ?? []) as unknown as PaperRow[]).map(rowToPaper)
      await attachPairings(papers)
      ownPapers.value = papers
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchPapers') }
    } finally {
      isLoading.value = false
    }
  }

  /** The platform library, as RLS shows it to this center (published + matched). */
  async function fetchLibraryPapers(): Promise<{ error: string | null }> {
    isLoading.value = true
    try {
      const { data, error: fetchError } = await supabase
        .from('papers')
        .select(PAPER_SELECT)
        .is('organization_id', null)
        .order('updated_at', { ascending: false })
      if (fetchError) throw fetchError

      const papers = ((data ?? []) as unknown as PaperRow[]).map(rowToPaper)
      await attachPairings(papers)
      libraryPapers.value = papers
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchPapers') }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPaperItems(paperId: string): Promise<{ error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_paper_items', {
        p_paper_id: paperId,
      })
      if (rpcError) throw rpcError
      const items = (data ?? []).map(rowToPaperItem)

      // The reach of an edit: how many papers each item sits in. RLS limits
      // the reference table to papers the caller may read, which is exactly
      // the set an edit here would change for them.
      if (items.length > 0) {
        const { data: refs, error: refsError } = await supabase
          .from('paper_items')
          .select('item_id')
          .in(
            'item_id',
            items.map((item) => item.id),
          )
        if (refsError) throw refsError
        const counts = new Map<string, number>()
        for (const ref of refs ?? []) {
          counts.set(ref.item_id, (counts.get(ref.item_id) ?? 0) + 1)
        }
        for (const item of items) item.usedInPapers = counts.get(item.id) ?? 0
      }

      currentItems.value = items
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchPapers') }
    }
  }

  /** Load one paper plus its items into the builder state. */
  async function fetchPaperDetail(id: string): Promise<{ error: string | null }> {
    isLoadingCurrent.value = true
    currentPaper.value = null
    currentItems.value = []
    try {
      const [{ data, error: fetchError }, itemsResult] = await Promise.all([
        supabase.from('papers').select(PAPER_SELECT).eq('id', id).single(),
        fetchPaperItems(id),
      ])
      if (fetchError) throw fetchError
      if (itemsResult.error) return { error: itemsResult.error }

      currentPaper.value = rowToPaper(data as unknown as PaperRow)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedFetchPapers') }
    } finally {
      isLoadingCurrent.value = false
    }
  }

  async function createPaper(title: string): Promise<{ id: string | null; error: string | null }> {
    try {
      const { data, error: insertError } = await supabase
        .from('papers')
        .insert({
          title,
          organization_id: ownerOrgId(),
          created_by: authStore.user!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      return { id: data.id, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedCreatePaper') }
    }
  }

  /**
   * A draft paper of random picks matching `lines`, owned by whoever asked:
   * the platform for an admin, the caller's center for a teacher. The spec is
   * kept, so single items can be re-rolled later. Lines the bank could not
   * fill come back as shortfalls.
   */
  async function generatePaper(input: {
    title: string
    lines: GenerationLine[]
  }): Promise<{ id: string | null; shortfalls: GenerationShortfall[]; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('generate_paper', {
        p_title: input.title,
        p_spec: specToJson(input.lines),
      })
      if (rpcError) throw rpcError
      const result = data as unknown as { paper_id: string; shortfalls: GenerationShortfall[] }
      return { id: result.paper_id, shortfalls: result.shortfalls, error: null }
    } catch (err) {
      return { id: null, shortfalls: [], error: handleError(err, 'failedCreatePaper') }
    }
  }

  async function updatePaper(
    id: string,
    updates: {
      title?: string
      description?: string | null
      timeLimitSeconds?: number | null
      shuffleQuestions?: boolean
      status?: AssessmentStatus
    },
  ): Promise<{ error: string | null }> {
    try {
      const patch: Database['public']['Tables']['papers']['Update'] = {}
      if (updates.title !== undefined) patch.title = updates.title
      if (updates.description !== undefined) patch.description = updates.description
      if (updates.timeLimitSeconds !== undefined)
        patch.time_limit_seconds = updates.timeLimitSeconds
      if (updates.shuffleQuestions !== undefined) patch.shuffle_questions = updates.shuffleQuestions
      if (updates.status !== undefined) patch.status = updates.status

      const { data, error: updateError } = await supabase
        .from('papers')
        .update(patch)
        .eq('id', id)
        .select(PAPER_SELECT)
        .single()

      if (updateError) throw updateError

      const updated = rowToPaper(data as unknown as PaperRow)
      if (currentPaper.value?.id === id) currentPaper.value = updated
      ownPapers.value = ownPapers.value.map((item) => (item.id === id ? updated : item))
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdatePaper') }
    }
  }

  async function deletePaper(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('papers').delete().eq('id', id)
      if (deleteError) throw deleteError

      ownPapers.value = ownPapers.value.filter((item) => item.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeletePaper') }
    }
  }

  // ── items: references into the bank ────────────────────────

  function nextPosition(): number {
    return currentItems.value.reduce((max, item) => Math.max(max, item.position), -1) + 1
  }

  function bumpItemCount(paperId: string, delta: number) {
    if (currentPaper.value?.id === paperId) currentPaper.value.itemCount += delta
  }

  /** Reference existing bank items, appended in the given order. */
  async function addBankItems(
    paperId: string,
    itemIds: string[],
  ): Promise<{ error: string | null }> {
    if (itemIds.length === 0) return { error: null }
    try {
      const base = nextPosition()
      const { error: insertError } = await supabase.from('paper_items').insert(
        itemIds.map((itemId, index) => ({
          paper_id: paperId,
          item_id: itemId,
          position: base + index,
        })),
      )
      if (insertError) throw insertError

      bumpItemCount(paperId, itemIds.length)
      return await fetchPaperItems(paperId)
    } catch (err) {
      return { error: handleError(err, 'failedAddAssessmentQuestions') }
    }
  }

  /**
   * Author an item inside the paper: it is created IN THE BANK, filed under
   * `subTopicId` and owned by whoever owns the paper, then referenced.
   */
  async function createItem(
    paperId: string,
    input: {
      payload: AdhocPayload
      subTopicId: string
      difficulty?: QuestionDifficulty
      points?: number
    },
  ): Promise<{ id: string | null; error: string | null }> {
    const { question, error } = await bankStore.createQuestion({
      payload: input.payload,
      difficulty: input.difficulty ?? 'medium',
      subTopicId: input.subTopicId,
      points: input.points,
    })
    if (error || !question) return { id: null, error }

    const { error: linkError } = await addBankItems(paperId, [question.id])
    if (linkError) return { id: null, error: linkError }
    return { id: question.id, error: null }
  }

  /** Drop the reference; the bank keeps the item. */
  async function removeItem(paperId: string, itemId: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase
        .from('paper_items')
        .delete()
        .eq('paper_id', paperId)
        .eq('item_id', itemId)
      if (deleteError) throw deleteError

      currentItems.value = currentItems.value.filter((item) => item.id !== itemId)
      bumpItemCount(paperId, -1)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveAssessmentQuestion') }
    }
  }

  /** Optimistic reorder; returns the previous order for rollback. */
  function applyItemOrder(orderedIds: string[]): string[] | null {
    const byId = new Map(currentItems.value.map((item) => [item.id, item]))
    if (orderedIds.length !== byId.size || orderedIds.some((id) => !byId.has(id))) return null
    const previous = currentItems.value.map((item) => item.id)
    currentItems.value = orderedIds.map((id, index) => ({ ...byId.get(id)!, position: index }))
    return previous
  }

  async function persistItemOrder(
    paperId: string,
    orderedIds: string[],
  ): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('reorder_paper_items', {
        p_paper_id: paperId,
        p_ids: orderedIds,
      })
      if (rpcError) throw rpcError
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedReorderAssessmentQuestions') }
    }
  }

  /** Patch the local paper row for a bank item (optimistic apply). */
  function applyItemPatch(id: string, patch: BankQuestionPatch) {
    const existing = currentItems.value.find((item) => item.id === id)
    if (!existing) return
    if (patch.payload) {
      Object.assign(existing, adhocDisplayFields(patch.payload), { payload: patch.payload })
    }
    if (patch.difficulty) existing.difficulty = patch.difficulty
    if (patch.points !== undefined) existing.points = patch.points
    if (patch.subTopicId) existing.subTopicId = patch.subTopicId
  }

  /** Persist a bank patch — the write is the bank's; every paper sees it. */
  async function persistItemPatch(
    id: string,
    patch: BankQuestionPatch,
  ): Promise<{ error: string | null }> {
    const result = await bankStore.updateQuestion(id, patch)
    if (!result.error) applyItemPatch(id, patch)
    return result
  }

  async function setItemTags(id: string, tagIds: string[]): Promise<{ error: string | null }> {
    const existing = currentItems.value.find((item) => item.id === id)
    const result = await bankStore.setTags(id, tagIds, existing?.tagIds ?? [])
    if (!result.error && existing) existing.tagIds = tagIds
    return result
  }

  /** Re-roll one generated item: another pick from the same spec line. */
  async function regenerateItem(
    paperId: string,
    itemId: string,
  ): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('regenerate_paper_item', {
        p_paper_id: paperId,
        p_item_id: itemId,
      })
      if (rpcError) throw rpcError
      return await fetchPaperItems(paperId)
    } catch (err) {
      return { error: handleError(err, 'failedRegenerateQuestion', { localizeRaise: true }) }
    }
  }

  /**
   * Copy a paper the caller may read into their own center's library, as a
   * draft referencing the same items. The original is untouched.
   */
  async function adoptPaper(paperId: string): Promise<{ id: string | null; error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('adopt_paper', {
        p_paper_id: paperId,
      })
      if (rpcError) throw rpcError
      return { id: data, error: null }
    } catch (err) {
      return { id: null, error: handleError(err, 'failedAdoptPaper') }
    }
  }

  function $reset() {
    ownPapers.value = []
    libraryPapers.value = []
    isLoading.value = false
    currentPaper.value = null
    currentItems.value = []
    isLoadingCurrent.value = false
  }

  return {
    ownPapers,
    libraryPapers,
    isLoading,
    currentPaper,
    currentItems,
    isLoadingCurrent,
    fetchOwnPapers,
    fetchLibraryPapers,
    fetchPaperDetail,
    fetchPaperItems,
    createPaper,
    generatePaper,
    updatePaper,
    deletePaper,
    addBankItems,
    createItem,
    removeItem,
    applyItemOrder,
    persistItemOrder,
    applyItemPatch,
    persistItemPatch,
    setItemTags,
    regenerateItem,
    adoptPaper,
    $reset,
  }
})
