<script lang="ts" module>
	export interface PickableMember {
		id: string;
		name: string;
		/** Secondary line: "username · grade" for a student, an email for a teacher. */
		detail: string | null;
	}
</script>

<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as InputGroup from '#lib/components/ui/input-group/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';

	/** A searchable list of people to tick. The selection belongs to the parent. */
	let {
		members,
		selectedIds = $bindable(),
		disabledIds,
		disabledLabel,
		searchPlaceholder,
		emptyText
	}: {
		members: PickableMember[];
		selectedIds: string[];
		/** People who cannot be picked, such as those already in the classroom. */
		disabledIds: string[];
		disabledLabel: string;
		searchPlaceholder: string;
		emptyText: string;
	} = $props();

	let search = $state('');

	const filtered = $derived.by(() => {
		const query = search.toLowerCase().trim();
		if (!query) return members;
		return members.filter(
			(member) =>
				member.name.toLowerCase().includes(query) || member.detail?.toLowerCase().includes(query)
		);
	});

	function toggle(id: string) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((selected) => selected !== id)
			: [...selectedIds, id];
	}
</script>

<div class="flex flex-col gap-2">
	<InputGroup.Root>
		<InputGroup.Addon>
			<SearchIcon />
		</InputGroup.Addon>
		<InputGroup.Input
			bind:value={search}
			type="search"
			aria-label={searchPlaceholder}
			placeholder={searchPlaceholder}
		/>
	</InputGroup.Root>

	<!-- An 18px box with an 8px inset. -->
	<ScrollArea class="max-h-64 rounded-2xl border">
		<Field.FieldGroup class="gap-1 p-2">
			{#each filtered as member (member.id)}
				{@const disabled = disabledIds.includes(member.id)}
				<Field.Field orientation="horizontal" data-disabled={disabled ? true : undefined}>
					<Checkbox
						id="pick-{member.id}"
						checked={disabled || selectedIds.includes(member.id)}
						onCheckedChange={() => toggle(member.id)}
						{disabled}
					/>
					<Field.FieldContent class="min-w-0 gap-0">
						<Field.FieldLabel for="pick-{member.id}" class="truncate"
							>{member.name}</Field.FieldLabel
						>
						{#if member.detail}
							<Field.FieldDescription class="truncate text-xs"
								>{member.detail}</Field.FieldDescription
							>
						{/if}
					</Field.FieldContent>
					{#if disabled}
						<Badge variant="secondary">{disabledLabel}</Badge>
					{/if}
				</Field.Field>
			{:else}
				<Empty.Root class="py-6">
					<Empty.Header>
						<Empty.Description>{emptyText}</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/each}
		</Field.FieldGroup>
	</ScrollArea>
</div>
