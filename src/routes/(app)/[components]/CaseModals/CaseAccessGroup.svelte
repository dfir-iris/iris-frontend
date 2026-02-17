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

	const opts = $derived.by(() =>
		groups.map((g) => ({ value: String(g.group_id), label: g.group_name }))
	);

	onMount(async () => {
		const groupsResponse = (await GroupsService.list()).data as unknown as RequestResponse<Group[]>;
		groups = groupsResponse.data as Group[];
	});
</script>

<div class="flex flex-col overflow-hidden bg-card">
	<div class="flex flex-col items-start justify-between gap-2">
		<div class="flex text-xl font-bold">Set case access via groups</div>

		{#if groups.length}
			<div class="flex w-2/3 gap-1">
				<div class="flex w-2/3">
					<SearchSelect
						multiple
						value={groupIds}
						options={opts}
						placeholder="Select group(s)"
						searchPlaceholder="Search"
						onChange={(v) => (groupIds = v as string[])}
					/>
				</div>

				<div class="flex">
					<SearchSelect
						value={access}
						options={ACCESS_OPTIONS}
						placeholder="Select Access"
						searchPlaceholder="Search"
						onChange={(value) => (access = value as string)}
					/>
				</div>
			</div>
		{/if}
	</div>
</div>
