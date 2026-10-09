<script lang="ts">
	import { page } from '$app/state';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import logo from '#lib/assets/logo.svg';
	import AccountMenu from '#lib/components/app/account-menu.svelte';
	import Cover from '#lib/components/app/cover.svelte';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { initials } from '#lib/initials.js';
	import { classroomPath, isCurrent, type NavItem } from '#lib/navigation.js';
	import { m } from '#lib/paraglide/messages.js';
	import { resolvePath } from '#lib/paths.js';
	import { homePath } from '#lib/roles.js';
	import type { Classroom } from '#lib/server/classrooms.js';
	import type { SessionUser } from '#lib/server/session.js';

	let {
		user,
		items,
		classrooms,
		classroom,
		toDo
	}: {
		user: SessionUser;
		items: NavItem[];
		/** Every classroom the person can reach. */
		classrooms: Classroom[];
		/** The classroom the person is inside, if any. */
		classroom: Classroom | undefined;
		/** How many assignments a student has yet to do, by the classroom's id. */
		toDo: Record<string, number>;
	} = $props();

	const role = $derived(user.role);

	/**
	 * A teacher and a student move between a handful of classrooms, so theirs
	 * are listed here and one click apart. A manager's are every classroom of
	 * the organization, too many to list, and have a page instead.
	 */
	const listedFor = $derived(role === 'teacher' || role === 'student' ? role : null);

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

{#snippet links()}
	<Sidebar.Group>
		<Sidebar.GroupContent>
			<Sidebar.Menu>
				{#each items as item (item.href)}
					{@const href = resolvePath(item.href)}
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
						<a href={resolvePath(homePath(role))} {...props}>
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
		{#if items.length > 0}
			{@render links()}
		{/if}
		{#if listedFor && classrooms.length > 0}
			<Sidebar.Group>
				<Sidebar.GroupLabel class="text-sidebar-foreground/85">
					{m.nav_classrooms()}
				</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each classrooms as item (item.id)}
							{@const active = item.id === classroom?.id}
							{@const waiting = toDo[item.id] ?? 0}
							<Sidebar.MenuItem>
								<!-- With work waiting, the row keeps room for its count at the end. -->
								<Sidebar.MenuButton
									size="lg"
									class={['px-2', waiting > 0 && 'pe-9']}
									isActive={active}
									tooltipContent={item.name}
								>
									{#snippet child({ props })}
										<a
											href={resolvePath(classroomPath(listedFor, item.id))}
											aria-current={active ? 'true' : undefined}
											{...props}
										>
											<Cover id={item.id} coverUrl={item.coverUrl} class={tile} />
											{@render twoLines(item.name, `${item.gradeLevelName} · ${item.subjectName}`)}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
								{#if waiting > 0}
									<Sidebar.MenuBadge
										class="top-1/2! right-2 -translate-y-1/2 bg-sidebar-foreground px-1.5 font-bold text-sidebar!"
									>
										<span aria-hidden="true">{waiting}</span>
										<span class="sr-only">{m.todo_count({ count: waiting })}</span>
									</Sidebar.MenuBadge>
								{/if}
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
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
							{@render twoLines(user.name, user.login)}
							<ChevronsUpDownIcon class="ms-auto" />
						</Sidebar.MenuButton>
					{/snippet}
				</AccountMenu>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
