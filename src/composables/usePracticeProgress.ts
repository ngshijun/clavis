import { usePracticeStore } from '@/stores/practice'
import type { Topic } from '@/stores/curriculum'

export function usePracticeProgress() {
  const practiceStore = usePracticeStore()

  function isSubTopicFullyPracticed(subTopic: { id: string; questionCount: number }) {
    return (
      subTopic.questionCount > 0 &&
      practiceStore.getSubTopicAnsweredCount(subTopic.id) >= subTopic.questionCount
    )
  }

  function getTopicProgress(topic: Topic) {
    const total = topic.subTopics.length
    const completed = topic.subTopics.filter(isSubTopicFullyPracticed).length
    return { total, completed }
  }

  function isTopicFullyPracticed(topic: Topic) {
    const { total, completed } = getTopicProgress(topic)
    return total > 0 && completed >= total
  }

  return {
    isSubTopicFullyPracticed,
    getTopicProgress,
    isTopicFullyPracticed,
  }
}
