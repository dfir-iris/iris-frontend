<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { Loader2Icon, PlusIcon, XIcon } from 'lucide-svelte';
	import { clickOutside } from '$lib/actions/click-outside';
	import type { Tag, TagInput } from '$lib/types/resources/tag';
	import { TagsService } from '$lib/services/tags.service';
	import { cn } from '$lib/utils';
	import { normalizeTags, tagsToString } from '$lib/utils/tags';

	let {
		tags = $bindable([]),
		disabled = false,
		placeholder = 'Add tags...',
		maxTags = 10,
		className = '',
		outputFormat = 'array',
		onchange
	}: {
		tags: TagInput;
		disabled?: boolean;
		placeholder?: string;
		maxTags?: number;
		className?: string;
		outputFormat?: 'array' | 'string';
		onchange?: (tags: Tag[]) => void;
	} = $props();

	let inputValue = $state('');
	let internalTags = $state<Tag[]>([]);
	let suggestions = $state<Tag[]>([]);
	let selectedIndex = $state(-1);
	let loading = $state(false);
	let open = $state(false);

	let inputElement = $state<HTMLInputElement>();
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		internalTags = normalizeTags(tags);
	});

	const updateTags = (nextTags: Tag[]) => {
		internalTags = nextTags;
		tags = outputFormat === 'string' ? tagsToString(nextTags) : nextTags;
		onchange?.(nextTags);
	};

	const search = async (value: string) => {
		const query = value.trim();

		if (!query) {
			suggestions = [];
			open = false;
			return;
		}

		loading = true;
		open = true;

		try {
			suggestions = await TagsService.suggestions(query, { fetch });
			selectedIndex = -1;
		} finally {
			loading = false;
		}
	};

	const queueSearch = () => {
		if (debounceTimer) clearTimeout(debounceTimer);

		debounceTimer = setTimeout(() => {
			search(inputValue);
		}, 300);
	};

	const addTag = async (tag: Tag) => {
		const exists = internalTags.some(
			(current) => current.tag_title.toLowerCase() === tag.tag_title.toLowerCase()
		);

		if (exists || internalTags.length >= maxTags) return;

		updateTags([...internalTags, tag]);

		inputValue = '';
		suggestions = [];
		open = false;

		await tick();
		inputElement?.focus();
	};

	const createTag = () => {
		const title = inputValue.trim();

		if (!title) return;

		addTag({
			tag_id: -Date.now(),
			tag_title: title
		});
	};

	const removeTag = (index: number) => {
		updateTags(internalTags.filter((_, i) => i !== index));
	};

	const handleInput = (event: Event) => {
		const value = (event.target as HTMLInputElement).value;

		if (value.includes(',')) {
			const parts = value.split(',');

			parts.slice(0, -1).forEach((part) => {
				const title = part.trim();

				if (title) {
					addTag({
						tag_id: -Date.now() - Math.floor(Math.random() * 1000),
						tag_title: title
					});
				}
			});

			inputValue = parts.at(-1) ?? '';
			queueSearch();
			return;
		}

		inputValue = value;
		queueSearch();
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (disabled) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();

			if (selectedIndex >= 0 && suggestions[selectedIndex]) {
				addTag(suggestions[selectedIndex]);
			} else {
				createTag();
			}

			return;
		}

		if (event.key === ',' && inputValue.trim()) {
			event.preventDefault();
			createTag();
			return;
		}

		if (event.key === 'Backspace' && inputValue === '' && internalTags.length > 0) {
			removeTag(internalTags.length - 1);
			return;
		}

		if (event.key === 'Escape') {
			open = false;
		}
	};

	const handlePaste = (event: ClipboardEvent) => {
		const text = event.clipboardData?.getData('text') ?? '';

		if (!text.includes(',')) return;

		event.preventDefault();

		text.split(',').forEach((part) => {
			const title = part.trim();

			if (title) {
				addTag({
					tag_id: -Date.now() - Math.floor(Math.random() * 1000),
					tag_title: title
				});
			}
		});
	};

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});
</script>

<div
	class={cn(
		'relative flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
		disabled && 'cursor-not-allowed opacity-50',
		className
	)}
	use:clickOutside={() => (open = false)}
>
	{#each internalTags as tag, index (tag.tag_id)}
		<div class="flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-xs">
			<span>{tag.tag_title}</span>

			{#if !disabled}
				<button
					type="button"
					class="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
					onclick={() => removeTag(index)}
					aria-label={`Remove ${tag.tag_title} tag`}
				>
					<XIcon class="h-3 w-3" />
				</button>
			{/if}
		</div>
	{/each}

	{#if !disabled && internalTags.length < maxTags}
		<input
			bind:this={inputElement}
			value={inputValue}
			oninput={handleInput}
			onfocus={() => {
				open = true;
				queueSearch();
			}}
			onkeydown={handleKeydown}
			onpaste={handlePaste}
			type="text"
			class="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
			placeholder={internalTags.length === 0 ? placeholder : ''}
		/>
	{/if}

	{#if open && (suggestions.length > 0 || loading || inputValue.trim())}
		<div
			class="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md"
		>
			{#if loading}
				<div class="flex items-center justify-center p-2">
					<Loader2Icon class="h-4 w-4 animate-spin text-muted-foreground" />
					<span class="ml-2 text-sm text-muted-foreground">Loading suggestions...</span>
				</div>
			{:else}
				<ul role="listbox" class="max-h-60 overflow-auto p-1">
					{#each suggestions as suggestion, i}
						<li
							class={cn(
								'flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm',
								selectedIndex === i
									? 'bg-accent text-accent-foreground'
									: 'hover:bg-accent hover:text-accent-foreground'
							)}
							onclick={() => addTag(suggestion)}
							onkeydown={(e) => e.key === 'Enter' && addTag(suggestion)}
							tabindex="0"
							role="option"
							aria-selected={selectedIndex === i}
						>
							{suggestion.tag_title}
						</li>
					{/each}

					{#if inputValue.trim() && !suggestions.some((tag) => tag.tag_title.toLowerCase() === inputValue
									.trim()
									.toLowerCase())}
						<li
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
							onclick={createTag}
							onkeydown={(e) => e.key === 'Enter' && createTag()}
							tabindex="0"
							role="option"
							aria-selected="false"
						>
							<PlusIcon class="mr-1 h-4 w-4" />
							Create "{inputValue}"
						</li>
					{/if}
				</ul>
			{/if}
		</div>
	{/if}
</div>
