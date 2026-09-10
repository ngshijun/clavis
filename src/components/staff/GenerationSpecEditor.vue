<script setup lang="ts">
import { computed } from 'vue'
import type { Topic } from '@/stores/curriculum'
import { emptyGenerationLine, type DifficultyMix, type GenerationLine } from '@/lib/generationSpec'
import { DIFFICULTIES } from '@/stores/assessment-bank'
import { Plus, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import CurriculumMultiSelect, {
  type CurriculumMultiSelectGroup,
} from '@/components/shared/CurriculumMultiSelect.vue'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import { useT } from '@/composables/useT'

/**
 * The generation spec (decision 90, P18b) as a list of lines. A line names
 * one or more sub-topics of the subject — its questions are drawn from all
 * of them mixed — plus optional learning points, a difficulty ratio over
 * low/medium/high, and a count. The count is split across the three levels
 * by that ratio, so 10 questions at 50/30/20 come back as 5 low, 3 medium
 * and 2 high. The same editor serves a teacher's assessment and an admin's
 * template.
 */
const props = defineProps<{
  /** The subject's topics — the only sub-topics a line may name. */
  topics: Topic[]
  disabled?: boolean
  /** Admins may create tags inline; staff only pick. */
  allowCreateTags?: boolean
}>()

const lines = defineModel<GenerationLine[]>({ required: true })

const t = useT()

const total = computed(() => lines.value.reduce((sum, line) => sum + (line.count || 0), 0))

/** The sub-topic picker's groups: one per topic of the subject. */
const groups = computed<CurriculumMultiSelectGroup[]>(() =>
  props.topics.map((topic) => ({
    label: topic.name,
    items: topic.subTopics.map((subTopic) => ({ id: subTopic.id, name: subTopic.name })),
  })),
)

/**
 * Learning points are scoped to TOPICS (P19a), so a line's tag picker offers
 * the union of the topics its chosen sub-topics belong to.
 */
function lineTopicIds(line: GenerationLine): string[] {
  const topicIds = props.topics
    .filter((topic) => topic.subTopics.some((subTopic) => line.subTopicIds.includes(subTopic.id)))
    .map((topic) => topic.id)
  return [...new Set(topicIds)]
}

function mixTotal(mix: DifficultyMix): number {
  return DIFFICULTIES.reduce((sum, level) => sum + (mix[level] || 0), 0)
}

function addLine() {
  lines.value = [...lines.value, emptyGenerationLine()]
}

function removeLine(index: number) {
  lines.value = lines.value.filter((_, i) => i !== index)
}

function patch(index: number, changes: Partial<GenerationLine>) {
  lines.value = lines.value.map((line, i) => (i === index ? { ...line, ...changes } : line))
}

function patchMix(index: number, level: keyof DifficultyMix, value: unknown) {
  const line = lines.value[index]
  if (!line) return
  const share = Number(value)
  patch(index, {
    difficultyMix: {
      ...line.difficultyMix,
      [level]: Number.isFinite(share) ? Math.round(share) : 0,
    },
  })
}

/**
 * How the line's count actually lands, by the same largest-remainder split
 * the generator uses — so what the teacher sees here is what they get.
 */
function allocation(line: GenerationLine): Record<string, number> {
  const exact = DIFFICULTIES.map((level) => ({
    level,
    share: (line.count * (line.difficultyMix[level] || 0)) / 100,
  }))
  const result: Record<string, number> = {}
  for (const part of exact) result[part.level] = Math.floor(part.share)
  let leftover = line.count - Object.values(result).reduce((sum, n) => sum + n, 0)
  const byRemainder = [...exact].sort(
    (a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)),
  )
  for (const part of byRemainder) {
    if (leftover <= 0) break
    result[part.level] = (result[part.level] ?? 0) + 1
    leftover -= 1
  }
  return result
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="(line, index) in lines" :key="index" class="space-y-3 rounded-md border p-3">
      <div class="flex items-start justify-between gap-3">
        <Field class="min-w-0 flex-1">
          <FieldLabel>{{ t.staff.generate.lineSubTopics }}</FieldLabel>
          <CurriculumMultiSelect
            :model-value="line.subTopicIds"
            :groups="groups"
            :disabled="props.disabled"
            :add-label="t.staff.generate.addSubTopic"
            @update:model-value="(subTopicIds) => patch(index, { subTopicIds })"
          />
          <FieldDescription>{{ t.staff.generate.lineSubTopicsHint }}</FieldDescription>
        </Field>

        <Button
          v-if="lines.length > 1"
          type="button"
          variant="ghost"
          size="icon"
          class="size-9 shrink-0 text-destructive hover:text-destructive"
          :aria-label="t.staff.generate.removeLine"
          :disabled="props.disabled"
          @click="removeLine(index)"
        >
          <Trash2 class="size-4" />
        </Button>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <Field class="w-24">
          <FieldLabel>{{ t.staff.generate.lineCount }}</FieldLabel>
          <Input
            type="number"
            min="1"
            max="50"
            step="1"
            :model-value="line.count"
            :disabled="props.disabled"
            @update:model-value="(value) => patch(index, { count: Number(value) })"
          />
        </Field>

        <Field v-for="level in DIFFICULTIES" :key="level" class="w-24">
          <FieldLabel>{{ t.shared.difficulties[level] }} %</FieldLabel>
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
            :model-value="line.difficultyMix[level]"
            :disabled="props.disabled"
            @update:model-value="(value) => patchMix(index, level, value)"
          />
        </Field>
      </div>

      <p v-if="mixTotal(line.difficultyMix) !== 100" class="text-sm text-destructive" role="alert">
        {{ t.staff.generate.mixMustTotal(mixTotal(line.difficultyMix)) }}
      </p>
      <p v-else class="text-sm text-muted-foreground">
        {{
          t.staff.generate.mixBreakdown(
            allocation(line).low ?? 0,
            allocation(line).medium ?? 0,
            allocation(line).high ?? 0,
          )
        }}
      </p>

      <Field>
        <FieldLabel>{{ t.staff.generate.lineTags }}</FieldLabel>
        <TagMultiSelect
          :model-value="line.tagIds"
          :topic-ids="lineTopicIds(line)"
          :disabled="props.disabled"
          :allow-create="props.allowCreateTags === true"
          @update:model-value="(tagIds) => patch(index, { tagIds })"
        />
        <FieldDescription>{{ t.staff.generate.lineTagsHint }}</FieldDescription>
      </Field>
    </div>

    <div class="flex items-center justify-between">
      <Button type="button" variant="outline" size="sm" :disabled="props.disabled" @click="addLine">
        <Plus class="mr-2 size-4" />
        {{ t.staff.generate.addLine }}
      </Button>
      <span class="text-sm text-muted-foreground">{{
        t.staff.generate.totalQuestions(total)
      }}</span>
    </div>
  </div>
</template>
