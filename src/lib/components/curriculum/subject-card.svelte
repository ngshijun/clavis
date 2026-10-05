<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dragHandleZone } from 'svelte-dnd-action';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Subject } from '#lib/server/curriculum.js';
	import AddField from './add-field.svelte';
	import CoverButton from './cover-button.svelte';
	import DragHandle from './drag-handle.svelte';
	import InlineName from './inline-name.svelte';
	import { FLIP_MS, saveOrder } from './reorder.js';
	import RowDelete from './row-delete.svelte';
	import TopicRow from './topic-row.svelte';

	/** One subject as a column: its name on top, its topics listed beneath in order. */
	let { subject }: { subject: Subject } = $props();

	// The order on screen follows a drag at once and goes back to the stored one when the page reloads.
	let topics = $derived(subject.topics);
</script>

<Card.Root class="gap-0 py-0">
	<Card.Header class="group/row flex items-center gap-0.5 bg-muted/50 p-1">
		<DragHandle label={m.curriculum_reorder({ name: subject.name })} />
		<CoverButton kind="subject" id={subject.id} name={subject.name} coverUrl={subject.coverUrl} />
		<Card.Title class="flex min-w-0 flex-1">
			<InlineName
				kind="subject"
				id={subject.id}
				name={subject.name}
				class="flex-1"
				textClass="font-semibold"
			/>
		</Card.Title>
		<RowDelete target={{ kind: 'subject', id: subject.id, name: subject.name }} />
	</Card.Header>
	<Separator />
	<Card.Content class="gap-1 p-1">
		<ol
			aria-label={m.curriculum_topics_of({ name: subject.name })}
			use:dragHandleZone={{
				items: topics,
				type: `topics:${subject.id}`,
				flipDurationMs: FLIP_MS,
				dropTargetStyle: {}
			}}
			onconsider={(event) => (topics = event.detail.items)}
			onfinalize={(event) => {
				topics = event.detail.items;
				saveOrder({ kind: 'topic', parentId: subject.id }, subject.topics, topics);
			}}
		>
			{#each topics as topic (topic.id)}
				<li aria-label={topic.name} animate:flip={{ duration: FLIP_MS }}>
					<TopicRow {topic} />
				</li>
			{/each}
		</ol>
		<AddField
			place={{ kind: 'topic', parentId: subject.id }}
			placeholder={m.curriculum_add_topic()}
			label={m.curriculum_add_topic_to({ name: subject.name })}
		/>
	</Card.Content>
</Card.Root>
