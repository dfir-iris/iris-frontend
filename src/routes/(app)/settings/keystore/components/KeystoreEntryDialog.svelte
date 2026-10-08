<!--
  Create / edit a keystore entry. Secret values are write-only: on edit
  the field stays empty and an empty field keeps the stored value. The
  scope is fixed after creation; shared entries (admins only) can be
  limited to groups.
-->
<script lang="ts">
	import { KeyRoundIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import {
		KEYSTORE_NAME_RE,
		KeystoreService,
		type KeystoreEntry,
		type KeystoreEntryBody,
		type KeystoreScope
	} from '$lib/services/keystore.service';
	import MultiSelect, {
		type MultiSelectItem
	} from '../../ai-workflows/components/MultiSelect.svelte';
	import {
		describeApiError,
		LABEL_CLASS,
		SELECT_CLASS,
		TEXTAREA_CLASS
	} from '../../ai-workflows/helpers/ui';

	type Props = {
		open: boolean;
		/** Null = create. */
		entry: KeystoreEntry | null;
		isAdmin: boolean;
		canWritePersonal: boolean;
		groups: MultiSelectItem[];
		onSaved: (entry: KeystoreEntry) => void;
	};

	let { open = $bindable(), entry, isAdmin, canWritePersonal, groups, onSaved }: Props = $props();

	let name = $state('');
	let value = $state('');
	let isSecret = $state(true);
	let description = $state('');
	let scope = $state<KeystoreScope>('personal');
	let groupIds = $state<string[]>([]);
	let hostsText = $state('');
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	const editing = $derived(entry !== null);
	/** Editing a secret: the stored value stays unless a new one is typed. */
	const keepsSecret = $derived(!!entry && entry.is_secret && entry.has_value);

	$effect(() => {
		if (!open) return;
		name = entry?.name ?? '';
		value = entry && !entry.is_secret ? (entry.value ?? '') : '';
		isSecret = entry?.is_secret ?? true;
		description = entry?.description ?? '';
		scope = entry?.scope ?? (canWritePersonal ? 'personal' : 'shared');
		groupIds = (entry?.allowed_group_ids ?? []).map(String);
		hostsText = (entry?.allowed_hosts ?? []).join('\n');
		fieldErrors = {};
	});

	const nameValid = $derived(KEYSTORE_NAME_RE.test(name));
	const valueMissing = $derived(!value && !keepsSecret);
	const unsecretWithoutValue = $derived(keepsSecret && !isSecret && !value);

	function hosts(): string[] {
		return hostsText
			.split(/[\s,]+/)
			.map((h) => h.trim().toLowerCase())
			.filter((h) => h);
	}

	async function submit(e: Event) {
		e.preventDefault();
		if (!nameValid || valueMissing || unsecretWithoutValue) return;
		const body: KeystoreEntryBody = {
			name,
			is_secret: isSecret,
			description: description.trim() || null,
			allowed_hosts: hosts(),
			allowed_group_ids: scope === 'shared' ? groupIds.map(Number) : []
		};
		if (value) body.value = value;
		if (!editing) body.scope = scope;
		saving = true;
		const res = entry
			? await KeystoreService.update(entry.id, body)
			: await KeystoreService.create(body);
		saving = false;
		if (!res.ok) {
			const data = (res.data as { data?: unknown } | null)?.data;
			if (data && typeof data === 'object' && !Array.isArray(data)) {
				fieldErrors = Object.fromEntries(
					Object.entries(data as Record<string, unknown>).map(([k, v]) => [
						k,
						Array.isArray(v) ? v.join(', ') : String(v)
					])
				);
			}
			toast({
				title: editing ? 'Update failed' : 'Create failed',
				description: describeApiError(res.data, res.error?.message ?? 'Request failed'),
				variant: 'destructive'
			});
			return;
		}
		// Never keep a typed secret around once saved.
		value = '';
		toast({
			title: editing ? 'Entry updated' : 'Entry created',
			description: name,
			variant: 'success'
		});
		open = false;
		onSaved(res.data as KeystoreEntry);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[520px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<KeyRoundIcon size={14} />
				{editing ? `Edit ${entry?.name}` : 'New keystore entry'}
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Workflows reference it as <code class="font-mono">{`{{ key('${name || 'NAME'}') }}`}</code>.
			</Dialog.Description>
		</Dialog.Header>
		<form class="flex flex-col gap-3" onsubmit={submit} data-testid="ks-dialog" autocomplete="off">
			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Name (A–Z, 0–9, _)</span>
				<Input
					class="h-8 font-mono text-xs"
					bind:value={name}
					oninput={() => (name = name.toUpperCase())}
					placeholder="VIRUSTOTAL_API_KEY"
					data-testid="ks-name"
				/>
				{#if name && !nameValid}
					<span class="text-2xs text-destructive">Use 1–64 upper-case letters, digits or _.</span>
				{/if}
				{#if fieldErrors.name}<span class="text-2xs text-destructive">{fieldErrors.name}</span>{/if}
			</label>

			<label class="flex items-center justify-between gap-2 text-xs">
				<span>
					Secret
					<span class="block text-2xs text-muted-foreground">
						Secret values are never shown again, and are masked in run logs.
					</span>
				</span>
				<Switch
					checked={isSecret}
					onCheckedChange={(v: boolean) => (isSecret = v)}
					data-testid="ks-secret"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Value</span>
				<Input
					class="h-8 font-mono text-xs"
					type={isSecret ? 'password' : 'text'}
					autocomplete="new-password"
					bind:value
					placeholder={keepsSecret ? 'unchanged' : ''}
					data-testid="ks-value"
				/>
				{#if unsecretWithoutValue}
					<span class="text-2xs text-destructive">
						Type a new value to make a secret entry non-secret.
					</span>
				{/if}
				{#if fieldErrors.value}<span class="text-2xs text-destructive">{fieldErrors.value}</span
					>{/if}
			</label>

			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Description</span>
				<textarea class={TEXTAREA_CLASS.replace('font-mono ', '')} rows="2" bind:value={description}
				></textarea>
			</label>

			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>Scope</span>
				<select class={SELECT_CLASS} bind:value={scope} disabled={editing} data-testid="ks-scope">
					{#if canWritePersonal || scope === 'personal'}
						<option value="personal">Personal: only my workflows can use it</option>
					{/if}
					{#if isAdmin || scope === 'shared'}
						<option value="shared">Shared: every workflow (optionally limited to groups)</option>
					{/if}
				</select>
				{#if editing}
					<span class="text-2xs text-muted-foreground">The scope cannot change after creation.</span
					>
				{/if}
			</label>

			{#if scope === 'shared'}
				<div class="flex flex-col gap-1">
					<span class={LABEL_CLASS}>Limited to the workflows owned by members of</span>
					<MultiSelect
						items={[
							...groups,
							...groupIds
								.filter((id) => !groups.some((g) => g.value === id))
								.map((id) => ({ value: id, label: `Group #${id}` }))
						]}
						values={groupIds}
						placeholder="Every group"
						disabled={!isAdmin}
						onChange={(v) => (groupIds = v)}
						testId="ks-groups"
					/>
					{#if fieldErrors.allowed_group_ids}
						<span class="text-2xs text-destructive">{fieldErrors.allowed_group_ids}</span>
					{/if}
				</div>
			{/if}

			<label class="flex flex-col gap-1">
				<span class={LABEL_CLASS}>
					Allowed hosts (one per line; empty = any host the HTTP node may reach)
				</span>
				<textarea
					class={TEXTAREA_CLASS}
					rows="2"
					placeholder="www.virustotal.com"
					bind:value={hostsText}
					data-testid="ks-hosts"
				></textarea>
				{#if fieldErrors.allowed_hosts}
					<span class="text-2xs text-destructive">{fieldErrors.allowed_hosts}</span>
				{/if}
			</label>

			<Dialog.Footer>
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={saving || !nameValid || valueMissing || unsecretWithoutValue}
					data-testid="ks-submit"
				>
					{saving ? 'Saving…' : editing ? 'Save' : 'Create'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
