import { usePracticeStore } from '@/stores/practice'
import type { Topic } from '@/stores/curriculum'

export function usePracticeProgress() {
  const practiceStore = usePracticeStore()

  function isStageFullyPracticed(stage: { id: string; questionCount: number }) {
    return (
      stage.questionCount > 0 &&
      practiceStore.getStageAnsweredCount(stage.id) >= stage.questionCount
    )
  }

  function getTopicProgress(topic: Topic) {
    const total = topic.stages.length
    const completed = topic.stages.filter(isStageFullyPracticed).length
    return { total, completed }
  }

  function isTopicFullyPracticed(topic: Topic) {
    const { total, completed } = getTopicProgress(topic)
    return total > 0 && completed >= total
  }

  return {
    isStageFullyPracticed,
    getTopicProgress,
    isTopicFullyPracticed,
  }
}
