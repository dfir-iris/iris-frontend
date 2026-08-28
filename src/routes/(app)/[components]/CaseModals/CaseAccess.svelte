<script lang="ts">
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import { getContext, onMount } from 'svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { AccessLevel, CaseAccessService } from '$lib/services/case-access.service';
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { toast } from '$lib/components/ui/toast';
	import SearchSelect, {
		type SearchSelectProps
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import type { Access } from './types';
	import { ACCESS_OPTIONS } from './consts';
	import CaseAccessGroup from './CaseAccessGroup.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCaseId = cases.currentCaseId();

	type Row = { user: CaseAccessUserRow; access: Access | null };

	let usersAccess = $state<Row[]>([]);
	let loading = $state(false);
	let setAccessViaGroup = $state(false);
	let groupIds = $state<string[]>([]);
	let groupAccess = $state<string>('');

	const accessFromLevel = (level: number): Access | null => {
		if (!level || level === AccessLevel.DENY_ALL) return null;
		const label =
			ACCESS_OPTIONS.find((option) => Number(option.value) === level)?.label ?? `level_${level}`;
		return { name: label, level };
	};

	// One call to /api/v2/cases/{id}/access/users replaces the old N+1 fan-out
	// that walked every user on the server and queried per-user case access.
	// The endpoint returns the effective access for every user against this
	// case in a single round-trip.
	const refresh = async () => {
		loading = true;
		try {
			const res = await CaseService.listAccessUsers(currentCaseId);
			const rows: CaseAccessUserRow[] = Array.isArray(res?.data) ? res.data : [];

			usersAccess = rows.map((user) => ({
				user,
				access: accessFromLevel(user.user_access_level)
			}));
		} catch (error) {
			toast({
				variant: 'destructive',
				title: 'Failed to load case access',
				description: error instanceof Error ? error.message : undefined
			});
		} finally {
			loading = false;
		}
	};

	const updateUserAccess = async (userId: number, accessLevel: number) => {
		// Optimistic UI update so the dropdown reflects the new value while
		// the request is in flight. On failure we toast and revert via a
		// fresh refresh — cheaper than tracking per-row previous values.
		const previous = usersAccess;
		usersAccess = usersAccess.map((row) =>
			row.user.user_id === userId ? { ...row, access: accessFromLevel(accessLevel) } : row
		);

		try {
			const res = await CaseAccessService.setUserCasesAccess(userId, {
				cases_list: [currentCaseId],
				access_level: accessLevel
			});
			if (res?.error) throw new Error(res.error.message);
		} catch (error) {
			usersAccess = previous;
			toast({
				variant: 'destructive',
				title: 'Failed to update user access',
				description: error instanceof Error ? error.message : undefined
			});
		}
	};

	const columns: ColumnDef<unknown>[] = [
		{
			id: 'user_id',
			header: () => 'User ID',
			accessorKey: 'user.user_id'
		},
		{
			id: 'user_name',
			header: 'User Name',
			accessorKey: 'user.user_name'
		},
		{
			id: 'user_login',
			header: 'User Login',
			accessorKey: 'user.user_login'
		},
		{
			id: 'access_select',
			header: 'User Access',
			cell: (cell) =>
				renderComponent(SearchSelect, {
					value: String((cell.row?.original as Row).access?.level ?? AccessLevel.DENY_ALL),
					options: ACCESS_OPTIONS,
					onChange: (value) => {
						const userId = (cell.row?.original as Row).user.user_id;
						if (userId === undefined) return;
						void updateUserAccess(userId, Number(value));
					}
				} as SearchSelectProps)
		}
	];

	const saveAccessViaGroup = async () => {
		const accessLevel = Number(groupAccess);

		const results = await Promise.allSettled(
			groupIds.map((groupId) =>
				CaseAccessService.setGroupCasesAccess(Number(groupId), {
					cases_list: [currentCaseId],
					access_level: accessLevel
				})
			)
		);

		const failed = results.filter(
			(r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error)
		).length;

		if (failed > 0) {
			toast({
				variant: 'destructive',
				title: `Failed to update ${failed} group${failed === 1 ? '' : 's'}`
			});
		} else {
			toast({
				variant: 'success',
				title: `Updated access for ${groupIds.length} group${groupIds.length === 1 ? '' : 's'}`
			});
		}

		await refresh();
		setAccessViaGroup = false;
	};

	onMount(() => refresh());
</script>

<div class="flex flex-col">
	<div class="mb-3 flex items-center justify-between">
		<h3 class="text-sm font-semibold">Case access</h3>

		{#if !setAccessViaGroup}
			<div class="flex gap-2">
				<Button size="sm" variant="secondary" onclick={() => (setAccessViaGroup = true)}>
					Set access via group
				</Button>
				<Button size="sm" variant="ghost" onclick={() => refresh()} disabled={loading}>
					{loading ? 'Loading…' : 'Refresh'}
				</Button>
			</div>
		{/if}
	</div>

	{#if setAccessViaGroup}
		<CaseAccessGroup bind:groupIds bind:access={groupAccess} />
		<div class="mt-4 flex items-center justify-end gap-2">
			<Button variant="ghost" size="sm" onclick={() => (setAccessViaGroup = false)}>Cancel</Button>
			<Button size="sm" onclick={() => saveAccessViaGroup()}>Set access via group</Button>
		</div>
	{:else if loading && usersAccess.length === 0}
		<div class="py-8 text-center text-xs text-muted-foreground">Loading users…</div>
	{:else}
		<DataTable {columns} data={usersAccess} page={1} />
	{/if}
</div>
