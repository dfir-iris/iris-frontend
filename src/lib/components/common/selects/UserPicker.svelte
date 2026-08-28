<!--
  Inline multi-select user picker.

  Simpler than `CaseScopePicker` — the workspace user list is small and
  rarely changes, so we fetch it once into a client-side cache and
  filter against it locally. No pagination, no debounced server calls.

  Trigger summary follows the same conventions as `CaseScopePicker`:
    • `[]`  → "All users"
    • `1`   → that user's name
    • `2`   → both names
    • `3+`  → "N users selected"
-->
<script lang="ts">
	import { CheckIcon, SearchIcon, UserIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { UsersService, type User } from '$lib/services/users.service';

	type Props = {
		// Stringified user ids currently in scope; `[]` ≡ "all".
		values: string[];
		// Optional label cache keyed by stringified user id, so a parent
		// hydrating from URL state can show friendly labels before the
		// fetch lands.
		labels?: Record<string, string>;
		onChange: (ids: string[], labels: Record<string, string>) => void;
		triggerClass?: string;
	};

	let { values, labels = {}, onChange, triggerClass = '' }: Props = $props();

	let open = $state(false);
	let users = $state<User[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchText = $state('');

	let didLoad = false;

	const load = async () => {
		if (didLoad) return;
		loading = true;
		error = null;
		try {
			// The `/manage/users/list` endpoint returns the legacy IRIS
			// wrapper `{ status, message, data: User[] }`. The mention-list
			// loader in MarkDownEditor does the same unwrap dance —
			// mirror it here so a workspace-admin layout change doesn't
			// silently break both call sites in different ways.
			const res = await UsersService.list();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const inner = (res?.data as any)?.data;
			if (Array.isArray(inner)) {
				users = inner as User[];
			} else if (Array.isArray(res?.data)) {
				users = res.data as User[];
			} else {
				users = [];
			}
			didLoad = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	};

	$effect(() => {
		if (open) void load();
	});

	const filtered = $derived.by(() => {
		const q = searchText.trim().toLowerCase();
		if (!q) return users;
		return users.filter(
			(u) => u.user_name.toLowerCase().includes(q) || u.user_login.toLowerCase().includes(q)
		);
	});

	const isSelected = (id: number) => values.includes(String(id));

	const toggle = (u: User) => {
		const key = String(u.user_id);
		let nextIds: string[];
		const nextLabels = { ...labels, [key]: u.user_name };
		if (values.includes(key)) {
			nextIds = values.filter((v) => v !== key);
		} else {
			nextIds = [...values, key];
		}
		onChange(nextIds, nextLabels);
	};

	const selectAllVisible = () => {
		const nextLabels = { ...labels };
		const merged = new Set(values);
		for (const u of filtered) {
			const key = String(u.user_id);
			merged.add(key);
			nextLabels[key] = u.user_name;
		}
		onChange([...merged], nextLabels);
	};

	const deselectAllVisible = () => {
		const removeSet = new Set(filtered.map((u) => String(u.user_id)));
		const next = values.filter((v) => !removeSet.has(v));
		onChange(next, labels);
	};

	const clearScope = () => onChange([], labels);

	const summary = $derived.by(() => {
		if (values.length === 0) return 'All users';
		if (values.length === 1) return labels[values[0]] ?? `User #${values[0]}`;
		if (values.length === 2) {
			return values.map((id) => labels[id] ?? `#${id}`).join(', ');
		}
		return `${values.length} users selected`;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		<Button
			variant="outline"
			role="combobox"
			aria-expanded={open}
			class={`w-full justify-between truncate ${triggerClass}`}
		>
			<span class="inline-flex min-w-0 items-center gap-2 truncate">
				<UserIcon size={14} class="shrink-0 opacity-70" />
				<span class="truncate">{summary}</span>
			</span>
		</Button>
	</Popover.Trigger>

	<Popover.Content
		align="end"
		class="w-[24rem] min-w-[24rem] max-w-[calc(100vw-3rem)] p-0 sm:w-[28rem] sm:min-w-[28rem]"
	>
		<div class="flex items-center gap-2 border-b px-3 py-2">
			<SearchIcon size={14} class="shrink-0 opacity-60" />
			<Input
				bind:value={searchText}
				placeholder="Filter users…"
				class="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
			/>
		</div>

		<div
			class="flex items-center justify-between border-b px-3 py-1.5 text-2xs text-muted-foreground"
		>
			<div class="flex items-center gap-2">
				<button type="button" class="hover:text-foreground" onclick={selectAllVisible}>
					Select all
				</button>
				<span class="opacity-40">·</span>
				<button type="button" class="hover:text-foreground" onclick={deselectAllVisible}>
					Deselect all
				</button>
			</div>
			{#if values.length > 0}
				<button type="button" class="hover:text-foreground" onclick={clearScope}>
					Clear scope
				</button>
			{/if}
		</div>

		<div class="max-h-72 overflow-y-auto">
			{#if loading && users.length === 0}
				<p class="px-3 py-4 text-center text-xs text-muted-foreground">Loading users…</p>
			{:else if error}
				<p class="px-3 py-4 text-center text-xs text-destructive">{error}</p>
			{:else if filtered.length === 0}
				<p class="px-3 py-4 text-center text-xs text-muted-foreground">No users.</p>
			{:else}
				<ul class="py-1">
					{#each filtered as u (u.user_id)}
						{@const selected = isSelected(u.user_id)}
						<li>
							<button
								type="button"
								onclick={() => toggle(u)}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
							>
								<Checkbox checked={selected} class="pointer-events-none" />
								<div class="flex min-w-0 flex-1 flex-col">
									<span class="truncate font-medium" title={u.user_name}>{u.user_name}</span>
									<span class="truncate text-2xs text-muted-foreground" title={u.user_login}>
										{u.user_login}
									</span>
								</div>
								{#if selected}
									<CheckIcon size={12} class="shrink-0 text-primary" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
