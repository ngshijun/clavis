<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { ITEM_KINDS, KIND_GROUP_LABELS, KIND_GROUPS } from '#lib/items/kinds.js';
	import { ITEM_TYPES, type ItemType } from '#lib/items/payload.js';
	import { m } from '#lib/paraglide/messages.js';
	import { hint } from './styles.js';

	/**
	 * The fourteen types to start a question from, under the headings they are
	 * known by. The stage's own menu also starts a passage; the one inside a
	 * passage does not, since a passage holds questions only.
	 */
	let {
		onpick,
		onpassage,
		size = 'default'
	}: {
		onpick: (type: ItemType) => void;
		/** Starts a passage. Leave it out where one cannot be started. */
		onpassage?: () => void;
		/** `sm` for the menu inside a form, where it is one control among the fields. */
		size?: 'default' | 'sm';
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" {size} {...props}>
				<PlusIcon data-icon="inline-start" />
				{m.practice_add_question()}
				{#if size === 'default'}
					<ChevronDownIcon data-icon="inline-end" />
				{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<!-- Wide enough for two columns, so every entry is in view without scrolling. -->
	<DropdownMenu.Content
		align={size === 'default' ? 'end' : 'start'}
		aria-label={m.practice_question_types()}
		class="w-[min(38rem,calc(100vw-2rem))]"
	>
		{#each KIND_GROUPS as group (group)}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading class="pb-1">
					{KIND_GROUP_LABELS[group]()}
				</DropdownMenu.GroupHeading>
				<div class="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
					{#each ITEM_TYPES.filter((type) => ITEM_KINDS[type].group === group) as type (type)}
						{@render entry(ITEM_KINDS[type].label(), ITEM_KINDS[type].blurb(), () => onpick(type))}
					{/each}
				</div>
			</DropdownMenu.Group>
		{/each}
		{#if onpassage}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading class="pb-1">
					{m.practice_passage_group()}
				</DropdownMenu.GroupHeading>
				{@render entry(m.practice_passage(), m.practice_passage_blurb(), onpassage)}
			</DropdownMenu.Group>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

{#snippet entry(label: string, blurb: string, onSelect: () => void)}
	<DropdownMenu.Item class="flex-col items-start gap-0 py-1.5" {onSelect}>
		<span>{label}</span>
		<span class={[hint, 'font-normal']}>{blurb}</span>
	</DropdownMenu.Item>
{/snippet}
