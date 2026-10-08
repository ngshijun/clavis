<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PageToolbar from '#lib/components/app/page-toolbar.svelte';
	import Play from '#lib/components/runner/play.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	/** A stage played as a pupil gets it. Nothing answered here is recorded. */
	let { data }: PageProps = $props();
</script>

<PageToolbar>
	<span class="me-auto flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
		<EyeIcon class="size-4 shrink-0" aria-hidden="true" />
		{m.practice_preview_note()}
	</span>
	<Button variant="outline" href={data.builder}>{m.practice_preview_back()}</Button>
</PageToolbar>

{#if data.run.total === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon">
				<EyeIcon />
			</Empty.Media>
			<Empty.Title>{m.practice_preview_empty_title()}</Empty.Title>
			<Empty.Description>{m.practice_preview_empty_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<Play run={data.run} imageBase={data.imageBase} action="?/mark" />
{/if}
