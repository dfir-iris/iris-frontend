<script lang="ts">
	import { onMount } from 'svelte';
	import { GroupsService, type Group } from '$lib/services/groups.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import SearchSelect from '$lib/components/common/selects/SearchSelect.svelte';
	import { ACCESS_OPTIONS } from './consts';

	type Props = {
		groupIds?: string[];
		access?: string;
	};

	let { groupIds = $bindable<string[]>([]), access = $bindable<string>('') }: Props = $props();

	let groups = $state<Group[]>([]);
	let loading = $state(false);

	const opts = $derived.by(() =>
		groups.map((g) => ({ value: String(g.group_id), label: g.group_name }))
	);

	onMount(async () => {
		loading = true;
		try {
			const res = (await GroupsService.list()).data as unknown as RequestResponse<Group[]>;
			groups = (res.data as Group[]) ?? [];
		} finally {
			loading = false;
		}
	});
</script>

<div class="rounded-md border border-border bg-muted/30 p-3">
	<p class="mb-3 text-xs text-muted-foreground">
		Pick one or more groups and an access level. Every member of the selected
		groups will receive that access on this case.
	</p>

	{#if loading}
		<div class="py-4 text-center text-xs text-muted-foreground">Loading groups…</div>
	{:else if groups.length === 0}
		<div class="py-4 text-center text-xs text-muted-foreground">No groups available.</div>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
			<label class="flex flex-col gap-1">
				<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
					Groups
				</span>
				<SearchSelect
					size="sm"
					multiple
					value={groupIds}
					options={opts}
					placeholder="Select group(s)"
					searchPlaceholder="Search groups…"
					onChange={(v) => (groupIds = v as string[])}
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
					Access level
				</span>
				<SearchSelect
					size="sm"
					value={access}
					options={ACCESS_OPTIONS}
					placeholder="Select access"
					searchPlaceholder="Search"
					onChange={(value) => (access = value as string)}
				/>
			</label>
		</div>
	{/if}
</div>
