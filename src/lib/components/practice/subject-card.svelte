<script lang="ts">
	import Cover from '#lib/components/app/cover.svelte';
	import CoverCard from '#lib/components/app/cover-card.svelte';
	import { subjectInitial } from '#lib/initials.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PracticeSubject } from '#lib/server/practice.js';

	/**
	 * One subject, as the way into its practice: its cover, its name and how
	 * much it holds. A subject with no cover shows a letter of its name.
	 */
	let {
		subject,
		gradeName,
		href
	}: {
		subject: PracticeSubject;
		/** The grade level the subject is in, which its name often repeats. */
		gradeName: string;
		href: string;
	} = $props();

	const summary = $derived(
		[
			m.count_topics({ count: subject.topicCount }),
			m.count_stages({ count: subject.stageCount })
		].join(' · ')
	);
</script>

<CoverCard {href} name={subject.name}>
	{#snippet cover()}
		<Cover id={subject.id} coverUrl={subject.coverUrl} class="aspect-video w-full text-6xl">
			{subjectInitial(subject.name, gradeName)}
		</Cover>
	{/snippet}

	<div class="-mt-1.5 flex flex-col gap-0.5 text-muted-foreground">
		<span>{summary}</span>
		{#if subject.questionCount > 0}
			<span class="font-medium text-foreground">
				{m.count_questions({ count: subject.questionCount })}
			</span>
		{:else}
			<span>{m.practice_no_questions_yet()}</span>
		{/if}
	</div>
</CoverCard>
