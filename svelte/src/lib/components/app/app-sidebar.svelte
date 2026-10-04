<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SchoolIcon from '@lucide/svelte/icons/school';
	import logo from '#lib/assets/logo.svg';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { classroomsPath, type NavItem } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { Role } from '#lib/roles.js';
	import type { Classroom } from '#lib/server/classrooms.js';

	let {
		role,
		items,
		classroom,
		classroomCount
	}: {
		role: Role;
		items: NavItem[];
		/** The classroom the person is inside, if any: every link below belongs to it. */
		classroom: Classroom | undefined;
		classroomCount: number;
	} = $props();

	/**
	 * A teacher's or student's picker sends them straight back into their only
	 * classroom, so a link to it would bounce. A manager's is a real page.
	 */
	const canSwitch = $derived(role === 'manager' || classroomCount > 1);
</script>

{#snippet classroomName(classroom: Classroom)}
	<SchoolIcon class="text-muted-foreground" />
	<div class="grid flex-1 text-left leading-tight">
		<span class="truncate text-sm font-medium">{classroom.name}</span>
		<span class="truncate text-xs text-muted-foreground">
			{classroom.gradeLevelName} · {classroom.subjectName}
		</span>
	</div>
{/snippet}

<Sidebar.Root variant="inset">
	<Sidebar.Header>
		<div class="flex items-center gap-2 px-2 py-1.5">
			<img src={logo} alt={m.logo_alt()} class="size-10" />
			<div class="grid flex-1 text-left text-sm leading-tight">
				<span class="translate-y-1 truncate font-logo text-lg font-medium text-primary">Clavis</span
				>
				<span class="truncate text-xs text-muted-foreground">{m.app_tagline()}</span>
			</div>
		</div>
		<Sidebar.Separator />
	</Sidebar.Header>
	<Sidebar.Content>
		{#if classroom}
			<Sidebar.Group class="pb-0">
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						{#if canSwitch}
							<Sidebar.MenuButton size="lg">
								{#snippet child({ props })}
									<a href={resolve(classroomsPath(role))} title={m.classroom_switch()} {...props}>
										{@render classroomName(classroom)}
										<ChevronRightIcon class="ml-auto" />
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						{:else}
							<!-- Named, but not a control: there is no other classroom to switch to. -->
							<Sidebar.MenuButton size="lg" class="pointer-events-none">
								{#snippet child({ props })}
									<div {...props}>{@render classroomName(classroom)}</div>
								{/snippet}
							</Sidebar.MenuButton>
						{/if}
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Group>
		{/if}
		<Sidebar.Group>
			<Sidebar.GroupLabel>{m.navigation()}</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each items as item (item.href)}
						{@const href = resolve(item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={page.url.pathname === href}>
								{#snippet child({ props })}
									<a {href} {...props}>
										<item.icon />
										<span>{item.label()}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
</Sidebar.Root>
