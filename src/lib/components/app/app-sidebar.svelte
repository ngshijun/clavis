<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import logo from '#lib/assets/logo.svg';
	import AccountMenu from '#lib/components/app/account-menu.svelte';
	import Cover from '#lib/components/app/cover.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { initials } from '#lib/initials.js';
	import { classroomPath, isCurrent, type NavItem } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { homePath } from '#lib/roles.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { SessionUser } from '#lib/server/session.js';

	let {
		user,
		items,
		classrooms,
		classroom
	}: {
		user: SessionUser;
		items: NavItem[];
		/** Every classroom the person can reach. */
		classrooms: Classroom[];
		/** The classroom the person is inside, if any. */
		classroom: Classroom | undefined;
	} = $props();

	const role = $derived(user.role);

	/**
	 * A teacher moves between classrooms all day, so theirs are listed here and
	 * one click apart. A manager and a student see only the classroom they are
	 * inside, as a way back to the page they chose it from.
	 */
	const listed = $derived(role === 'teacher' ? classrooms : []);

	/**
	 * A student's picker sends them straight back into their only classroom, so
	 * a link to it would bounce. A manager's is a real page.
	 */
	const canSwitch = $derived(role === 'manager' || classrooms.length > 1);

	/**
	 * What a tall row leads with: a 40px tile, 8px inside the row's 14px corners
	 * on every side, so its own corners are 6px and the two stay concentric. On
	 * the icon rail the row is the tile, and the row's own corners clip it.
	 */
	const tile =
		'size-10 shrink-0 rounded-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-none';
</script>

{#snippet twoLines(first: string, second: string)}
	<span class="grid flex-1 text-start leading-tight">
		<span class="truncate text-sm font-medium">{first}</span>
		<span class="truncate text-xs text-sidebar-foreground/85">{second}</span>
	</span>
{/snippet}

{#snippet classroomRow(item: Classroom)}
	<Cover id={item.id} coverUrl={item.coverUrl} class={tile} />
	{@render twoLines(item.name, `${item.gradeLevelName} · ${item.subjectName}`)}
{/snippet}

{#snippet links()}
	<Sidebar.Group>
		<Sidebar.GroupContent>
			<Sidebar.Menu>
				{#each items as item (item.href)}
					{@const href = resolve(item.href)}
					{@const active = isCurrent(item, role, page.url.pathname)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={active} tooltipContent={item.label()}>
							{#snippet child({ props })}
								<a {href} aria-current={active ? 'page' : undefined} {...props}>
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
{/snippet}

<Sidebar.Root variant="inset" collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" class="px-2">
					{#snippet child({ props })}
						<a href={resolve(homePath(role))} {...props}>
							<span class={[tile, 'flex items-center justify-center bg-sidebar-primary']}>
								<img src={logo} alt={m.logo_alt()} class="size-4/5" />
							</span>
							<span class="grid flex-1 text-start leading-tight">
								<span class="translate-y-0.5 truncate font-logo text-lg">Clavis</span>
								<span class="truncate text-xs text-sidebar-foreground/85">{m.app_tagline()}</span>
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{#if listed.length > 0}
			{@render links()}
			<Sidebar.Group>
				<Sidebar.GroupLabel class="text-sidebar-foreground/85">
					{m.nav_classrooms()}
				</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each listed as item (item.id)}
							{@const active = item.id === classroom?.id}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									size="lg"
									class="px-2"
									isActive={active}
									tooltipContent={item.name}
								>
									{#snippet child({ props })}
										<a
											href={resolve(classroomPath('teacher', item.id))}
											aria-current={active ? 'true' : undefined}
											{...props}
										>
											{@render classroomRow(item)}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{:else}
			{#if classroom}
				<Sidebar.Group class="pb-0">
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							{#if canSwitch}
								<Sidebar.MenuButton size="lg" class="px-2" tooltipContent={m.classroom_switch()}>
									{#snippet child({ props })}
										<a href={resolve(homePath(role))} {...props}>
											{@render classroomRow(classroom)}
											<ChevronRightIcon class="ms-auto" />
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							{:else}
								<!-- Named, but not a control: there is no other classroom to switch to. -->
								<Sidebar.MenuButton size="lg" class="pointer-events-none px-2">
									{#snippet child({ props })}
										<div {...props}>
											{@render classroomRow(classroom)}
										</div>
									{/snippet}
								</Sidebar.MenuButton>
							{/if}
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.Group>
			{/if}
			{@render links()}
		{/if}
	</Sidebar.Content>

	<!-- The signed-in account sits at the foot of the sidebar, where the Mac App Store keeps it. -->
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<AccountMenu {user}>
					{#snippet trigger(props)}
						<Sidebar.MenuButton size="lg" class="px-2" {...props}>
							<Avatar.Root
								size="lg"
								class="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:text-xs after:hidden"
							>
								{#if user.avatarUrl}
									<Avatar.Image src={user.avatarUrl} alt="" />
								{/if}
								<Avatar.Fallback
									class="bg-sidebar-primary font-bold text-sidebar-primary-foreground"
								>
									{initials(user.name)}
								</Avatar.Fallback>
							</Avatar.Root>
							{@render twoLines(user.name, user.email)}
							<ChevronsUpDownIcon class="ms-auto" />
						</Sidebar.MenuButton>
					{/snippet}
				</AccountMenu>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
