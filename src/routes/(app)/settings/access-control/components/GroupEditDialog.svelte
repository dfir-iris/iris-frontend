<!--
  Add/Edit group dialog.

  Permission editor uses the schema's permission descriptors as a
  checklist. Toggling a permission ORs/ANDs the bit into / out of
  `group_permissions` — the backend stores the resulting bitmask
  verbatim.

  The `standard_user` permission is shown as a "ground truth" tick
  rather than an editable toggle — every authenticated user needs
  it, and the backend forces it on at save time. We surface it for
  clarity.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		AccessControlService,
		type AccessControlGroup,
		type AccessControlSchemaInfo,
		type CreateGroupBody,
		type UpdateGroupBody
	} from '$lib/services/access-control.service';

	type Props = {
		open: boolean;
		group: AccessControlGroup | null;
		schema: AccessControlSchemaInfo;
		showError: (msg: string, fallback?: string) => void;
		onSaved: (group: AccessControlGroup) => void;
	};

	let { open = $bindable(), group, schema, showError, onSaved }: Props = $props();
	const isEdit = $derived(group != null);

	let form = $state<CreateGroupBody>({
		group_name: '',
		group_description: '',
		group_permissions: 1 // standard_user
	});
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		error = null;
		if (group) {
			form = {
				group_name: group.group_name,
				group_description: group.group_description ?? '',
				group_permissions: group.group_permissions
			};
		} else {
			form = {
				group_name: '',
				group_description: '',
				group_permissions: schema.permissions.find((p) => p.name === 'standard_user')?.value ?? 1
			};
		}
	});

	const togglePerm = (bit: number) => {
		if ((form.group_permissions & bit) === bit) {
			form.group_permissions &= ~bit;
		} else {
			form.group_permissions |= bit;
		}
	};

	const submit = async () => {
		if (form.group_name.trim().length < 2) {
			error = 'Name must be at least 2 characters';
			return;
		}
		busy = true;
		error = null;
		try {
			if (isEdit && group) {
				const body: UpdateGroupBody = {
					group_name: form.group_name.trim(),
					group_description: form.group_description?.trim() ?? '',
					group_permissions: form.group_permissions
				};
				const res = await AccessControlService.updateGroup(group.group_id, body);
				if (res.ok && res.data && typeof res.data !== 'string') {
					onSaved(res.data as AccessControlGroup);
					open = false;
				} else {
					const data = res.data as { message?: string; data?: unknown } | null;
					error = data?.message ?? res.error?.message ?? 'Save failed';
				}
			} else {
				const res = await AccessControlService.createGroup({
					group_name: form.group_name.trim(),
					group_description: form.group_description?.trim() ?? '',
					group_permissions: form.group_permissions
				});
				if (res.ok && res.data && typeof res.data !== 'string') {
					onSaved(res.data as AccessControlGroup);
					open = false;
				} else {
					const data = res.data as { message?: string; data?: unknown } | null;
					error = data?.message ?? res.error?.message ?? 'Create failed';
				}
			}
		} catch (e) {
			showError((e as Error).message);
		} finally {
			busy = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{isEdit ? 'Edit group' : 'Add group'}</Dialog.Title>
			<Dialog.Description>
				Groups bundle permissions. Users inherit the union of every group they belong to.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3 pt-2">
			<div class="flex flex-col gap-1">
				<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ged-name">
					Name *
				</label>
				<Input id="ged-name" class="h-7 text-xs" bind:value={form.group_name} disabled={busy} />
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-2xs uppercase tracking-wide text-muted-foreground" for="ged-desc">
					Description
				</label>
				<Textarea id="ged-desc" rows={2} bind:value={form.group_description} disabled={busy} />
			</div>

			<section>
				<h3 class="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
					Permissions
				</h3>
				<div class="max-h-[40vh] overflow-y-auto rounded-md border">
					<ul class="divide-y">
						{#each schema.permissions as p (p.value)}
							{@const ticked = (form.group_permissions & p.value) === p.value}
							<li>
								<label class="flex cursor-pointer items-start gap-2 px-3 py-2 text-2xs hover:bg-muted/30">
									<Checkbox
										checked={ticked}
										onCheckedChange={() => togglePerm(p.value)}
										disabled={busy}
									/>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="font-medium">{p.label}</span>
											<span class="font-mono text-3xs text-muted-foreground">
												{p.name}
											</span>
											<span class="font-mono text-3xs text-muted-foreground">
												0x{p.value.toString(16)}
											</span>
										</div>
										{#if p.description}
											<p class="text-muted-foreground">{p.description}</p>
										{/if}
									</div>
								</label>
							</li>
						{/each}
					</ul>
				</div>
			</section>

			{#if error}
				<p class="text-2xs text-destructive whitespace-pre-wrap">{error}</p>
			{/if}
		</div>

		<Dialog.Footer class="pt-3">
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={submit} disabled={busy}>
				{busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
