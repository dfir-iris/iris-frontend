<!--
  Renders a CustomAttribute schema as a set of tabs + fields.

  Serves two callers:
    • The admin preview panel on /settings/custom-attributes — read-only,
      shows what analysts will see next time they open a detail page.
    • Later: the analyst-side "extra tabs" on case / IOC / asset / task /
      note / evidence / event / client detail pages — same renderer, but
      with `bind:values` so edits round-trip back to the object.

  Field types mirror the legacy Jinja renderer at
  iris-web/.../modal_attributes_tabs.html — see the type map there for
  the canonical contract:
    • input_string     -> <input type="text">
    • input_textfield  -> <textarea>
    • input_checkbox   -> <input type="checkbox">
    • input_select     -> <select> populated from `options[]`
    • input_date       -> <input type="date">
    • input_datetime   -> <input type="datetime-local">
    • raw              -> field label only (matches legacy behavior; the
                          legacy Jinja template also only rendered the
                          field name for `raw` — see line ~48)
    • html             -> value rendered as trusted HTML; the backend
                          sanitises before storing.

  If `values` is provided (analyst-side), each input is bound to
  `values[tab][field]` so edits mutate the passed-in object. If it's
  omitted (admin preview), inputs stay defaulted to the schema's `value`
  and are disabled.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import type { CustomAttributeSchema, CustomAttributeField } from '$lib/services/custom-attributes.service';

	type Props = {
		schema: CustomAttributeSchema;
		// When provided, inputs bind into this object (analyst editing).
		// When omitted, inputs render defaults read-only (admin preview).
		values?: Record<string, Record<string, unknown>>;
		readonly?: boolean;
	};

	let { schema, values, readonly = false }: Props = $props();

	const tabNames = $derived(Object.keys(schema ?? {}));
	let activeTab = $state<string>('');

	$effect(() => {
		// Reset the active tab if the schema shape changes (e.g. admin
		// pastes a new JSON that removes the currently-open tab). Also
		// seeds the initial value once the schema first arrives.
		if (tabNames.length === 0) {
			activeTab = '';
			return;
		}
		if (!tabNames.includes(activeTab)) {
			activeTab = tabNames[0];
		}
	});

	const isEditing = $derived(!!values && !readonly);

	const stringValue = (f: CustomAttributeField): string => {
		if (typeof f.value === 'string') return f.value;
		if (f.value == null) return '';
		return String(f.value);
	};

	const boolValue = (f: CustomAttributeField): boolean => f.value === true;

	// Round-trip helpers — write back into `values[tab][field]` when
	// the analyst is editing. Guard against undefined intermediate
	// objects (caller may pass a partially-populated values map).
	const writeValue = (tab: string, field: string, next: unknown) => {
		if (!values) return;
		if (!values[tab]) values[tab] = {};
		values[tab][field] = next;
	};

	const readValue = (tab: string, field: string, fallback: unknown): unknown => {
		if (!values) return fallback;
		return values[tab]?.[field] ?? fallback;
	};
</script>

{#if tabNames.length === 0}
	<p class="px-3 py-6 text-center text-xs text-muted-foreground">
		This schema has no tabs yet. Add one with the JSON editor to see the
		preview.
	</p>
{:else}
	<Tabs bind:value={activeTab} class="flex min-h-0 w-full flex-1 flex-col">
		<div class="flex w-full shrink-0 border-b">
			<TabsList class="h-auto w-full justify-start rounded-none border-0 bg-transparent p-0">
				{#each tabNames as tab (tab)}
					<TabsTrigger
						value={tab}
						class="rounded-none px-4 py-2 text-xs font-medium transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background"
					>
						{tab}
					</TabsTrigger>
				{/each}
			</TabsList>
		</div>

		<div class="min-h-0 flex-1 overflow-auto">
			{#each tabNames as tab (tab)}
				<TabsContent value={tab} class="m-0 p-4">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each Object.entries(schema[tab] ?? {}) as [fieldName, field] (fieldName)}
							{@const disabled = !isEditing}
							{@const mandatory = field.mandatory === true}
							<div class="flex flex-col gap-1.5">
								{#if field.type !== 'raw'}
									<Label class="text-xs font-medium">
										{fieldName}
										{#if mandatory}
											<span class="text-destructive">*</span>
										{/if}
									</Label>
								{/if}

								{#if field.type === 'input_string'}
									<Input
										type="text"
										class="h-8 text-xs"
										value={readValue(tab, fieldName, stringValue(field)) as string}
										{disabled}
										required={mandatory}
										oninput={(e) => writeValue(tab, fieldName, e.currentTarget.value)}
									/>
								{:else if field.type === 'input_textfield'}
									<Textarea
										class="min-h-[7rem] text-xs"
										value={readValue(tab, fieldName, stringValue(field)) as string}
										{disabled}
										required={mandatory}
										oninput={(e) => writeValue(tab, fieldName, e.currentTarget.value)}
									/>
								{:else if field.type === 'input_checkbox'}
									<div class="flex items-center gap-2">
										<Checkbox
											checked={readValue(tab, fieldName, boolValue(field)) as boolean}
											{disabled}
											onCheckedChange={(v) => writeValue(tab, fieldName, v === true)}
										/>
										<span class="text-2xs text-muted-foreground">
											{boolValue(field) ? 'Default: on' : 'Default: off'}
										</span>
									</div>
								{:else if field.type === 'input_select'}
									<!--
									  Native <select> to match legacy behavior and
									  avoid pulling the bits-ui Select machinery
									  (which needs a Root + Trigger + Content and
									  doesn't play well with a dynamic `options`
									  array coming out of user-controlled JSON).
									-->
									<select
										class="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-60"
										value={readValue(tab, fieldName, stringValue(field)) as string}
										{disabled}
										required={mandatory}
										onchange={(e) => writeValue(tab, fieldName, e.currentTarget.value)}
									>
										{#each field.options ?? [] as opt (opt)}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else if field.type === 'input_date'}
									<Input
										type="date"
										class="h-8 text-xs"
										value={readValue(tab, fieldName, stringValue(field)) as string}
										{disabled}
										required={mandatory}
										oninput={(e) => writeValue(tab, fieldName, e.currentTarget.value)}
									/>
								{:else if field.type === 'input_datetime'}
									<Input
										type="datetime-local"
										class="h-8 text-xs"
										value={readValue(tab, fieldName, stringValue(field)) as string}
										{disabled}
										required={mandatory}
										oninput={(e) => writeValue(tab, fieldName, e.currentTarget.value)}
									/>
								{:else if field.type === 'raw'}
									<p class="text-xs text-muted-foreground">{fieldName}</p>
								{:else if field.type === 'html'}
									<!--
									  The HTML type is stored server-side after
									  sanitisation (see manage_attribute_db.py's
									  merge/render path). We render as trusted
									  HTML here, mirroring the legacy Jinja
									  `sanitize_attribute_html` filter contract.
									-->
									<div class="prose prose-xs max-w-none text-xs">
										{@html stringValue(field)}
									</div>
								{:else}
									<p class="text-2xs text-destructive">
										Unknown field type: {field.type}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</TabsContent>
			{/each}
		</div>
	</Tabs>
{/if}
