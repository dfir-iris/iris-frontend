<!--
  Interactive editor for a case template, driven by the field
  descriptors returned by `GET /api/v2/manage/case-templates/schema`.

  Layout principles:
    • Top-level scalar fields render as a flat 2-column form — nothing
      collapsible, nothing nested visually.
    • Repeating sections (tasks + note directories) live in their own
      well-defined card section with a header strip, count badge and
      an Add button.
    • Each task / note-directory row stays compact: title input first,
      everything else folds away behind a single "More" toggle so the
      list reads like a list, not a sprawl of inputs.
    • Notes inside a note directory render as a flat list of title +
      content pairs — no extra card-in-a-card chrome.

  The widgets themselves are still data-driven (kind → component), so
  the schema introspection contract is unchanged. We just stopped
  recursively rendering every field config as an identical
  card-in-card-in-card.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronRightIcon,
		ListChecksIcon,
		FolderIcon,
		PlusIcon,
		StickyNoteIcon,
		Trash2Icon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import type {
		CaseTemplateField,
		CaseTemplateItemField,
		CaseTemplateSchemaInfo
	} from '$lib/services/case-templates.service';
	import type { CaseClassification } from '$lib/services/case-classifications.service';

	type Props = {
		schema: CaseTemplateSchemaInfo;
		value: Record<string, unknown>;
		onChange: (value: Record<string, unknown>) => void;
		classifications: CaseClassification[];
		disabled?: boolean;
	};

	let { schema, value, onChange, classifications, disabled = false }: Props = $props();

	// Split editable fields into two buckets so we can lay out the
	// scalars compactly and give each repeating section its own
	// chrome. Order within each bucket follows the schema's
	// declaration order.
	const editableFields = $derived<CaseTemplateField[]>(
		schema.fields.filter((f) => !f.dump_only && f.name !== 'created_by_user_id')
	);
	const scalarFields = $derived<CaseTemplateField[]>(
		editableFields.filter((f) => f.kind !== 'list[object]')
	);
	const objectListFields = $derived<CaseTemplateField[]>(
		editableFields.filter((f) => f.kind === 'list[object]')
	);

	// Collapse state for "More" details on each repeating row, keyed
	// by `${fieldName}.${rowIndex}`. Title field stays always visible
	// so the list reads even when everything is collapsed.
	let openRows = $state<Record<string, boolean>>({});
	const toggleRow = (key: string) => {
		openRows = { ...openRows, [key]: !openRows[key] };
	};

	const setField = (name: string, next: unknown) => {
		onChange({ ...value, [name]: next });
	};

	// --- Tag chip helpers --------------------------------------------
	const commitTags = (current: string[], raw: string): string[] => {
		const parts = raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		if (parts.length === 0) return current;
		const merged = [...current];
		for (const p of parts) if (!merged.includes(p)) merged.push(p);
		return merged;
	};

	// --- Object list helpers -----------------------------------------
	const blankItem = (fields: CaseTemplateItemField[]): Record<string, unknown> => {
		const out: Record<string, unknown> = {};
		for (const f of fields) {
			if (f.kind === 'list[string]') out[f.name] = [];
			else if (f.kind === 'list[object]') out[f.name] = [];
			else if (f.kind === 'boolean') out[f.name] = false;
			else if (f.kind === 'integer') out[f.name] = null;
			else out[f.name] = '';
		}
		return out;
	};

	const addItem = (fieldName: string, itemKind: 'task' | 'note_directory' | 'note') => {
		const existing = Array.isArray(value[fieldName]) ? (value[fieldName] as unknown[]) : [];
		setField(fieldName, [...existing, blankItem(schema.item_schemas[itemKind])]);
		// Open the new row so the user can start typing immediately.
		openRows = { ...openRows, [`${fieldName}.${existing.length}`]: true };
	};

	const removeItem = (fieldName: string, index: number) => {
		const existing = Array.isArray(value[fieldName]) ? (value[fieldName] as unknown[]) : [];
		setField(
			fieldName,
			existing.filter((_, i) => i !== index)
		);
	};

	const updateItem = (
		fieldName: string,
		index: number,
		patch: Record<string, unknown>
	) => {
		const existing = Array.isArray(value[fieldName]) ? (value[fieldName] as unknown[]) : [];
		const next = existing.map((it, i) => (i === index ? { ...(it as object), ...patch } : it));
		setField(fieldName, next);
	};

	const addNote = (dirIndex: number) => {
		const fieldName = 'note_directories';
		const dirs = Array.isArray(value[fieldName])
			? (value[fieldName] as Record<string, unknown>[])
			: [];
		const dir = dirs[dirIndex] ?? {};
		const notes = Array.isArray(dir.notes) ? (dir.notes as unknown[]) : [];
		updateItem(fieldName, dirIndex, {
			notes: [...notes, blankItem(schema.item_schemas.note)]
		});
	};

	const removeNote = (dirIndex: number, noteIndex: number) => {
		const fieldName = 'note_directories';
		const dirs = Array.isArray(value[fieldName])
			? (value[fieldName] as Record<string, unknown>[])
			: [];
		const dir = dirs[dirIndex] ?? {};
		const notes = Array.isArray(dir.notes) ? (dir.notes as unknown[]) : [];
		updateItem(fieldName, dirIndex, {
			notes: notes.filter((_, i) => i !== noteIndex)
		});
	};

	const updateNote = (
		dirIndex: number,
		noteIndex: number,
		patch: Record<string, unknown>
	) => {
		const fieldName = 'note_directories';
		const dirs = Array.isArray(value[fieldName])
			? (value[fieldName] as Record<string, unknown>[])
			: [];
		const dir = dirs[dirIndex] ?? {};
		const notes = Array.isArray(dir.notes) ? (dir.notes as Record<string, unknown>[]) : [];
		updateItem(fieldName, dirIndex, {
			notes: notes.map((n, i) => (i === noteIndex ? { ...n, ...patch } : n))
		});
	};

	// Icon per repeating section. Picked by field name rather than
	// kind so the visual stays stable even if the schema renames a
	// list type later.
	const iconFor = (name: string) => {
		if (name === 'tasks') return ListChecksIcon;
		if (name === 'note_directories') return FolderIcon;
		return ListChecksIcon;
	};

	// One-shot DOM id generator for `<label for>` bindings.
	let idCounter = 0;
	const nextId = (prefix: string) => {
		idCounter += 1;
		return `${prefix}-${idCounter}`;
	};
</script>

<div class="flex flex-col gap-5 p-4">
	<!-- ===== Scalar fields ============================================ -->
	<section class="grid grid-cols-1 gap-3 md:grid-cols-2">
		{#each scalarFields as field (field.name)}
			{@const id = nextId(`tpl-${field.name}`)}
			<!--
			  Long-form fields (textareas + tag editors) deserve full
			  width; scalar inputs share the 2-column grid.
			-->
			<div
				class={field.kind === 'text' || field.kind === 'list[string]'
					? 'md:col-span-2'
					: ''}
			>
				<div class="flex flex-col gap-1">
					<div class="flex items-baseline gap-2">
						<label
							for={id}
							class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							{field.label}
							{#if field.required}
								<span class="text-destructive">*</span>
							{/if}
						</label>
						{#if field.max_length}
							<span class="text-2xs text-muted-foreground">
								max {field.max_length} chars
							</span>
						{/if}
					</div>

					{#if field.kind === 'string' && field.name === 'classification'}
						<Input
							{id}
							list={`${id}-options`}
							placeholder="malware, phishing, …"
							value={String(value[field.name] ?? '')}
							maxlength={field.max_length ?? undefined}
							{disabled}
							oninput={(e) =>
								setField(field.name, (e.currentTarget as HTMLInputElement).value)}
						/>
						<datalist id={`${id}-options`}>
							{#each classifications as c (c.id)}
								<option value={c.name}>{c.name_expanded}</option>
							{/each}
						</datalist>
					{:else if field.kind === 'string'}
						<Input
							{id}
							value={String(value[field.name] ?? '')}
							maxlength={field.max_length ?? undefined}
							{disabled}
							oninput={(e) =>
								setField(field.name, (e.currentTarget as HTMLInputElement).value)}
						/>
					{:else if field.kind === 'text'}
						<Textarea
							{id}
							rows={3}
							value={String(value[field.name] ?? '')}
							{disabled}
							oninput={(e) =>
								setField(field.name, (e.currentTarget as HTMLTextAreaElement).value)}
						/>
					{:else if field.kind === 'integer'}
						<Input
							{id}
							type="number"
							value={value[field.name] == null ? '' : String(value[field.name])}
							{disabled}
							oninput={(e) => {
								const raw = (e.currentTarget as HTMLInputElement).value.trim();
								setField(field.name, raw === '' ? null : Number(raw));
							}}
						/>
					{:else if field.kind === 'boolean'}
						<Switch
							checked={Boolean(value[field.name])}
							onCheckedChange={(v: boolean) => setField(field.name, v)}
							{disabled}
						/>
					{:else if field.kind === 'list[string]'}
						{@const tagList = Array.isArray(value[field.name])
							? (value[field.name] as string[])
							: []}
						<div
							class="flex flex-wrap items-center gap-1 rounded-md border bg-background p-1.5"
						>
							{#each tagList as tag, i}
								<span
									class="inline-flex items-center gap-1 rounded-sm border bg-muted/40 px-1.5 py-0.5 text-2xs"
								>
									{tag}
									<button
										type="button"
										class="text-muted-foreground hover:text-destructive"
										onclick={() =>
											setField(
												field.name,
												tagList.filter((_, ii) => ii !== i)
											)}
										{disabled}
										aria-label={`Remove tag ${tag}`}
									>
										<XIcon size={10} />
									</button>
								</span>
							{/each}
							<input
								type="text"
								class="min-w-[8rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
								placeholder={tagList.length ? '' : 'Type and press Enter…'}
								{disabled}
								onkeydown={(e) => {
									const target = e.currentTarget as HTMLInputElement;
									if (e.key === 'Enter' || e.key === ',') {
										e.preventDefault();
										setField(field.name, commitTags(tagList, target.value));
										target.value = '';
									} else if (
										e.key === 'Backspace' &&
										target.value === '' &&
										tagList.length > 0
									) {
										setField(
											field.name,
											tagList.filter((_, ii) => ii !== tagList.length - 1)
										);
									}
								}}
								onblur={(e) => {
									const target = e.currentTarget as HTMLInputElement;
									if (target.value.trim()) {
										setField(field.name, commitTags(tagList, target.value));
										target.value = '';
									}
								}}
							/>
						</div>
					{/if}

					{#if field.help}
						<p class="text-2xs text-muted-foreground">{field.help}</p>
					{/if}
				</div>
			</div>
		{/each}
	</section>

	<!-- ===== Repeating sections ====================================== -->
	{#each objectListFields as field (field.name)}
		{@const itemKind = field.item_schema ?? 'task'}
		{@const items = Array.isArray(value[field.name])
			? (value[field.name] as Record<string, unknown>[])
			: []}
		{@const itemFields = schema.item_schemas[itemKind]}
		{@const SectionIcon = iconFor(field.name)}

		<section class="overflow-hidden rounded-md border">
			<!-- Section header -->
			<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-center gap-2">
					<SectionIcon size={14} class="text-muted-foreground" />
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{field.label}
					</h3>
					<span class="text-2xs text-muted-foreground tabular-nums">{items.length}</span>
				</div>
				<Button
					variant="outline"
					size="sm"
					class="h-7"
					{disabled}
					onclick={() => addItem(field.name, itemKind)}
				>
					<PlusIcon size={12} class="mr-1" />
					Add
				</Button>
			</header>

			{#if field.help && items.length === 0}
				<p class="px-3 py-2 text-2xs text-muted-foreground">{field.help}</p>
			{/if}

			{#if items.length === 0}
				<p class="px-3 py-6 text-center text-xs text-muted-foreground">
					Nothing yet — click <span class="font-medium">Add</span> to insert one.
				</p>
			{:else}
				<ul class="divide-y">
					{#each items as item, idx}
						{@const rowKey = `${field.name}.${idx}`}
						{@const open = !!openRows[rowKey]}
						{@const titleId = nextId(`tpl-${field.name}-${idx}-title`)}
						<li class="flex flex-col gap-2 p-3">
							<!-- Row: chevron + inline title input + delete -->
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
									onclick={() => toggleRow(rowKey)}
									aria-label={open ? 'Collapse' : 'Expand'}
								>
									{#if open}
										<ChevronDownIcon size={12} />
									{:else}
										<ChevronRightIcon size={12} />
									{/if}
								</button>
								<label for={titleId} class="sr-only">Title</label>
								<Input
									id={titleId}
									class="h-7 flex-1 text-xs"
									placeholder={field.name === 'tasks'
										? 'Task title…'
										: 'Directory name…'}
									value={String(item.title ?? '')}
									{disabled}
									oninput={(e) =>
										updateItem(field.name, idx, {
											title: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<Button
									variant="ghost"
									size="sm"
									class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
									{disabled}
									onclick={() => removeItem(field.name, idx)}
									aria-label="Remove"
								>
									<Trash2Icon size={12} />
								</Button>
							</div>

							{#if open}
								<!-- Detail body: only the fields beyond `title`. -->
								<div class="flex flex-col gap-2 pl-8">
									{#each itemFields.filter((f) => f.name !== 'title') as f (f.name)}
										{@const fid = nextId(`tpl-${field.name}-${idx}-${f.name}`)}
										<div class="flex flex-col gap-1">
											<label
												for={fid}
												class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
											>
												{f.label}
												{#if f.required}
													<span class="text-destructive">*</span>
												{/if}
											</label>

											{#if f.kind === 'string'}
												<Input
													id={fid}
													class="h-7 text-xs"
													value={String(item[f.name] ?? '')}
													{disabled}
													oninput={(e) =>
														updateItem(field.name, idx, {
															[f.name]: (e.currentTarget as HTMLInputElement).value
														})}
												/>
											{:else if f.kind === 'text'}
												<Textarea
													id={fid}
													rows={3}
													value={String(item[f.name] ?? '')}
													{disabled}
													oninput={(e) =>
														updateItem(field.name, idx, {
															[f.name]: (e.currentTarget as HTMLTextAreaElement).value
														})}
												/>
											{:else if f.kind === 'list[string]'}
												{@const innerTags = Array.isArray(item[f.name])
													? (item[f.name] as string[])
													: []}
												<div
													class="flex flex-wrap items-center gap-1 rounded-md border bg-background p-1.5"
												>
													{#each innerTags as tag, ti}
														<span
															class="inline-flex items-center gap-1 rounded-sm border bg-muted/40 px-1.5 py-0.5 text-2xs"
														>
															{tag}
															<button
																type="button"
																class="text-muted-foreground hover:text-destructive"
																{disabled}
																onclick={() =>
																	updateItem(field.name, idx, {
																		[f.name]: innerTags.filter((_, i) => i !== ti)
																	})}
																aria-label={`Remove tag ${tag}`}
															>
																<XIcon size={10} />
															</button>
														</span>
													{/each}
													<input
														type="text"
														class="min-w-[6rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
														placeholder={innerTags.length ? '' : 'Add tag…'}
														{disabled}
														onkeydown={(e) => {
															const target = e.currentTarget as HTMLInputElement;
															if (e.key === 'Enter' || e.key === ',') {
																e.preventDefault();
																updateItem(field.name, idx, {
																	[f.name]: commitTags(innerTags, target.value)
																});
																target.value = '';
															}
														}}
														onblur={(e) => {
															const target = e.currentTarget as HTMLInputElement;
															if (target.value.trim()) {
																updateItem(field.name, idx, {
																	[f.name]: commitTags(innerTags, target.value)
																});
																target.value = '';
															}
														}}
													/>
												</div>
											{:else if f.kind === 'list[object]' && f.item_schema === 'note'}
												<!--
												  Notes inside a directory are inherently a
												  list of {title, content?}. We render them
												  as a vertical list of two-row stacks (no
												  card-in-card chrome) so a directory with
												  five notes still reads at a glance.
												-->
												{@const notes = Array.isArray(item[f.name])
													? (item[f.name] as Record<string, unknown>[])
													: []}
												<div class="flex flex-col gap-2">
													{#each notes as note, ni}
														<div
															class="flex flex-col gap-1 rounded-md border bg-muted/10 p-2"
														>
															<div class="flex items-center gap-2">
																<StickyNoteIcon
																	size={11}
																	class="shrink-0 text-muted-foreground"
																/>
																<Input
																	class="h-6 flex-1 text-xs"
																	placeholder="Note title…"
																	value={String(note.title ?? '')}
																	{disabled}
																	oninput={(e) =>
																		updateNote(idx, ni, {
																			title: (e.currentTarget as HTMLInputElement)
																				.value
																		})}
																/>
																<Button
																	variant="ghost"
																	size="sm"
																	class="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
																	{disabled}
																	onclick={() => removeNote(idx, ni)}
																	aria-label="Remove note"
																>
																	<XIcon size={11} />
																</Button>
															</div>
															<Textarea
																rows={2}
																class="text-xs"
																placeholder="Note content (markdown supported)…"
																value={String(note.content ?? '')}
																{disabled}
																oninput={(e) =>
																	updateNote(idx, ni, {
																		content: (e.currentTarget as HTMLTextAreaElement)
																			.value
																	})}
															/>
														</div>
													{/each}
													<Button
														variant="outline"
														size="sm"
														class="h-6 self-start text-2xs"
														{disabled}
														onclick={() => addNote(idx)}
													>
														<PlusIcon size={10} class="mr-1" />
														Add note
													</Button>
												</div>
											{/if}

											{#if f.help && f.kind !== 'list[object]'}
												<p class="text-2xs text-muted-foreground">{f.help}</p>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</div>
