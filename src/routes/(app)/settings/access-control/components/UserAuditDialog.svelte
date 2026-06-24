<!--
  User audit dialog.

  Calls `GET /api/v2/manage/users/<id>/audit` and renders two tables:
    • Effective case access — per-case, with the source that grants
      it (direct user, group X, org Y) and the resolved access level.
    • Effective permissions — per-permission bit, listing which
      group(s) contribute it.

  This is a read-only diagnostic surface; nothing here mutates state.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		AccessControlService,
		type AccessControlSchemaInfo,
		type AccessControlUser,
		type UserAudit
	} from '$lib/services/access-control.service';

	type Props = {
		open: boolean;
		user: AccessControlUser;
		schema: AccessControlSchemaInfo;
		showError: (msg: string, fallback?: string) => void;
	};

	let { open = $bindable(), user, schema, showError }: Props = $props();

	let audit = $state<UserAudit | null>(null);
	let loading = $state(false);

	$effect(() => {
		if (!open) return;
		audit = null;
		void load();
	});

	const load = async () => {
		loading = true;
		try {
			const res = await AccessControlService.auditUser(user.user_id);
			if (res.ok && res.data && typeof res.data !== 'string') {
				audit = res.data as UserAudit;
			} else {
				showError(res.error?.message ?? 'Failed to load audit');
			}
		} finally {
			loading = false;
		}
	};

	const accessLevelName = (value: number | undefined) => {
		if (value == null) return '—';
		return schema.case_access_levels.find((l) => l.value === value)?.label ?? String(value);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Effective access — @{user.user_login}</Dialog.Title>
			<Dialog.Description>
				Trace of where each permission and case grant comes from. Read-only.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 pt-2">
			{#if loading || audit == null}
				<div class="space-y-2">
					{#each Array(6) as _}
						<Skeleton class="h-7 w-full" />
					{/each}
				</div>
			{:else}
				<!-- Permissions -->
				<section>
					<h3 class="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
						Permissions
					</h3>
					<div class="max-h-[30vh] overflow-y-auto rounded-md border">
						{#if (audit.permissions_audit ?? []).length === 0}
							<p class="px-3 py-4 text-center text-2xs text-muted-foreground">
								No permissions granted.
							</p>
						{:else}
							<table class="w-full text-2xs">
								<thead class="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
									<tr>
										<th class="px-2 py-1">Permission</th>
										<th class="px-2 py-1">Granted by</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each audit.permissions_audit as row}
										<tr>
											<td class="px-2 py-1 font-mono">
												{row.permission ?? '?'}
											</td>
											<td class="px-2 py-1">
												{#if Array.isArray(row.groups) && row.groups.length > 0}
													<div class="flex flex-wrap gap-1">
														{#each row.groups as g}
															<span class="rounded-sm border bg-muted/40 px-1.5 py-0">{g}</span>
														{/each}
													</div>
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				</section>

				<!-- Case access -->
				<section>
					<h3 class="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
						Case access
					</h3>
					<div class="max-h-[30vh] overflow-y-auto rounded-md border">
						{#if (audit.access_audit ?? []).length === 0}
							<p class="px-3 py-4 text-center text-2xs text-muted-foreground">
								No case access.
							</p>
						{:else}
							<table class="w-full text-2xs">
								<thead class="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
									<tr>
										<th class="px-2 py-1">Case</th>
										<th class="px-2 py-1">Level</th>
										<th class="px-2 py-1">Source</th>
									</tr>
								</thead>
								<tbody class="divide-y">
									{#each audit.access_audit as row}
										<tr>
											<td class="px-2 py-1">
												{#if row.case_id != null}
													#{row.case_id}
												{/if}
												{#if row.case_name}
													— {row.case_name}
												{/if}
											</td>
											<td class="px-2 py-1">{accessLevelName(row.access_level as number | undefined)}</td>
											<td class="px-2 py-1 text-muted-foreground">{row.source ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>
				</section>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
