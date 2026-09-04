<script setup lang="ts">
import { computed } from 'vue'
import type { Topic } from '@/stores/curriculum'
import type { GenerationLine } from '@/stores/assessments'
import { DIFFICULTIES } from '@/stores/assessment-bank'
import { Plus, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

/**
 * The generation spec (decision 90) as a list of lines: a sub-topic of the
 * subject, optional learning points, optional difficulty, and a count. The
 * same editor serves a teacher's assessment and an admin's template.
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
const languageStore = useLanguageStore()

const ANY_VALUE = '__any__'

const total = computed(() => lines.value.reduce((sum, line) => sum + (line.count || 0), 0))

function emptyLine(): GenerationLine {
  return { subTopicId: '', tagIds: [], difficulty: null, count: 5 }
}

function addLine() {
  lines.value = [...lines.value, emptyLine()]
}

function removeLine(index: number) {
  lines.value = lines.value.filter((_, i) => i !== index)
}

function patch(index: number, changes: Partial<GenerationLine>) {
  lines.value = lines.value.map((line, i) => (i === index ? { ...line, ...changes } : line))
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="(line, index) in lines" :key="index" class="space-y-3 rounded-md border p-3">
      <div class="flex flex-wrap items-end gap-3">
        <Field class="min-w-[14rem] flex-1">
          <FieldLabel>{{ t.staff.generate.lineSubTopic }}</FieldLabel>
          <Select
            :key="`st-${index}-${languageStore.language}`"
            :model-value="line.subTopicId"
            :disabled="props.disabled"
            @update:model-value="(value) => patch(index, { subTopicId: String(value ?? '') })"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t.staff.generate.lineSubTopicPlaceholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup v-for="topic in props.topics" :key="topic.id">
                <SelectLabel>{{ topic.name }}</SelectLabel>
                <SelectItem
                  v-for="subTopic in topic.subTopics"
                  :key="subTopic.id"
                  :value="subTopic.id"
                >
                  {{ subTopic.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field class="w-40">
          <FieldLabel>{{ t.staff.generate.lineDifficulty }}</FieldLabel>
          <Select
            :key="`d-${index}-${languageStore.language}`"
            :model-value="line.difficulty ?? ANY_VALUE"
            :disabled="props.disabled"
            @update:model-value="
              (value) =>
                patch(index, {
                  difficulty: value === ANY_VALUE ? null : (value as GenerationLine['difficulty']),
                })
            "
          >
            <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="ANY_VALUE">{{ t.staff.generate.anyDifficulty }}</SelectItem>
              <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
                {{ t.shared.difficulties[level] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

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

        <Button
          v-if="lines.length > 1"
          type="button"
          variant="ghost"
          size="icon"
          class="size-9 text-destructive hover:text-destructive"
          :aria-label="t.staff.generate.removeLine"
          :disabled="props.disabled"
          @click="removeLine(index)"
        >
          <Trash2 class="size-4" />
        </Button>
      </div>

      <Field>
        <FieldLabel>{{ t.staff.generate.lineTags }}</FieldLabel>
        <TagMultiSelect
          :model-value="line.tagIds"
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
