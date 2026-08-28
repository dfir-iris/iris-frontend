<script lang="ts">
	import { SearchIcon, XIcon, ChevronRightIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { createEventDispatcher } from 'svelte';

	export interface SearchField {
		key: string;
		label: string;
		type: 'text' | 'number' | 'date' | 'select';
		operators?: string[];
		options?: { value: string; label: string }[];
	}

	export interface SearchCondition {
		field: string;
		operator: string;
		value: string;
		label?: string;
	}

	let {
		value = $bindable(),
		placeholder = 'Search or type field:operator:value...',
		fields = [],
		conditions = $bindable([]),
		allowRawSearch = true
	}: {
		value: string;
		placeholder?: string;
		fields: SearchField[];
		conditions: SearchCondition[];
		allowRawSearch?: boolean;
	} = $props();

	const dispatch = createEventDispatcher();

	// State for suggestion dropdown
	let showSuggestions = $state(false);
	let suggestions = $state<{
		type: 'field' | 'operator' | 'value' | 'complete';
		items: any[];
		currentField?: SearchField;
		currentOperator?: string;
	}>({ type: 'field', items: [] });
	let inputRef: HTMLInputElement | null = $state(null);
	let suggestionsContainer: HTMLElement | null = $state(null);
	let selectedSuggestionIndex = $state(-1);

	// Available operators based on the backend
	const operatorsByType = {
		text: [
			{ key: 'eq', label: '=', description: 'equals' },
			{ key: 'not', label: '!=', description: 'not equals' },
			{ key: 'like', label: '~', description: 'contains' },
			{ key: 'in', label: 'in', description: 'in list' },
			{ key: 'not_in', label: 'not_in', description: 'not in list' }
		],
		number: [
			{ key: 'eq', label: '=', description: 'equals' },
			{ key: 'not', label: '!=', description: 'not equals' },
			{ key: 'gt', label: '>', description: 'greater than' },
			{ key: 'lt', label: '<', description: 'less than' },
			{ key: 'gte', label: '>=', description: 'greater or equal' },
			{ key: 'lte', label: '<=', description: 'less or equal' },
			{ key: 'in', label: 'in', description: 'in list' },
			{ key: 'not_in', label: 'not_in', description: 'not in list' }
		],
		date: [
			{ key: 'eq', label: '=', description: 'equals' },
			{ key: 'not', label: '!=', description: 'not equals' },
			{ key: 'gt', label: '>', description: 'after' },
			{ key: 'lt', label: '<', description: 'before' },
			{ key: 'gte', label: '>=', description: 'on or after' },
			{ key: 'lte', label: '<=', description: 'on or before' }
		],
		select: [
			{ key: 'eq', label: '=', description: 'equals' },
			{ key: 'not', label: '!=', description: 'not equals' },
			{ key: 'in', label: 'in', description: 'in list' },
			{ key: 'not_in', label: 'not_in', description: 'not in list' }
		]
	};

	// Parse the current input to determine what to suggest
	function parseCurrentInput(input: string): {
		isFieldPattern: boolean;
		fieldPart: string;
		operatorPart: string;
		valuePart: string;
		isComplete: boolean;
	} {
		// For field:value or field:operator:value patterns, we need to be more careful about splitting
		// because field names can contain dots (like "ioc_type.type_name")

		// First, check if any field matches the beginning of the input
		let bestFieldMatch = '';
		let remainingInput = '';

		// Sort fields by length (longest first) to match the most specific field first
		const sortedFields = [...fields].sort((a, b) => b.key.length - a.key.length);

		for (const field of sortedFields) {
			if (input.startsWith(field.key + ':')) {
				bestFieldMatch = field.key;
				remainingInput = input.substring(field.key.length + 1);
				break;
			}
		}

		if (bestFieldMatch) {
			// We found a field match, now parse the remaining part
			const field = fields.find((f) => f.key === bestFieldMatch)!;

			if (!remainingInput) {
				// Just "field:" - waiting for operator or value
				return {
					isFieldPattern: true,
					fieldPart: bestFieldMatch,
					operatorPart: '',
					valuePart: '',
					isComplete: false
				};
			}

			// Check if remaining part starts with an operator
			const operators = operatorsByType[field.type] || operatorsByType.text;
			let operatorMatch = '';
			let valueMatch = '';

			for (const op of operators) {
				if (remainingInput.startsWith(op.key + ':')) {
					operatorMatch = op.key;
					valueMatch = remainingInput.substring(op.key.length + 1);
					break;
				} else if (remainingInput.startsWith(op.label + ':')) {
					operatorMatch = op.key;
					valueMatch = remainingInput.substring(op.label.length + 1);
					break;
				}
			}

			if (operatorMatch) {
				// field:operator:value pattern
				return {
					isFieldPattern: true,
					fieldPart: bestFieldMatch,
					operatorPart: operatorMatch,
					valuePart: valueMatch,
					isComplete: !!valueMatch
				};
			} else {
				// field:value pattern (no explicit operator)
				return {
					isFieldPattern: true,
					fieldPart: bestFieldMatch,
					operatorPart: field.type === 'text' ? 'like' : 'eq',
					valuePart: remainingInput,
					isComplete: true
				};
			}
		}

		// No field match found - check if we're still typing a field name
		const matchingField = fields.find(
			(f) =>
				f.key.toLowerCase().startsWith(input.toLowerCase()) ||
				f.label.toLowerCase().startsWith(input.toLowerCase())
		);

		if (matchingField) {
			return {
				isFieldPattern: true,
				fieldPart: input,
				operatorPart: '',
				valuePart: '',
				isComplete: false
			};
		}

		// No pattern match - treat as raw search
		return {
			isFieldPattern: false,
			fieldPart: '',
			operatorPart: '',
			valuePart: '',
			isComplete: false
		};
	}

	// Update suggestions based on current input
	function updateSuggestions(input: string) {
		if (!input.trim()) {
			showSuggestions = false;
			return;
		}

		const parsed = parseCurrentInput(input);

		if (!parsed.isFieldPattern) {
			// Show field suggestions
			const filteredFields = fields.filter(
				(f) =>
					f.key.toLowerCase().includes(input.toLowerCase()) ||
					f.label.toLowerCase().includes(input.toLowerCase())
			);

			suggestions = {
				type: 'field',
				items: filteredFields.map((f) => ({
					text: f.key,
					label: f.label,
					field: f,
					description: f.type
				}))
			};
		} else {
			const field = fields.find(
				(f) =>
					f.key === parsed.fieldPart || f.label.toLowerCase() === parsed.fieldPart.toLowerCase()
			);

			if (!field) {
				// Field not found, show field suggestions
				const filteredFields = fields.filter(
					(f) =>
						f.key.toLowerCase().includes(parsed.fieldPart.toLowerCase()) ||
						f.label.toLowerCase().includes(parsed.fieldPart.toLowerCase())
				);

				suggestions = {
					type: 'field',
					items: filteredFields.map((f) => ({
						text: f.key,
						label: f.label,
						field: f,
						description: f.type
					}))
				};
			} else if (!parsed.operatorPart) {
				// Show operator suggestions
				const operators = operatorsByType[field.type] || operatorsByType.text;
				suggestions = {
					type: 'operator',
					items: operators.map((op) => ({
						text: `${parsed.fieldPart}:${op.key}:`,
						label: op.label,
						key: op.key,
						description: op.description
					})),
					currentField: field
				};
			} else if (!parsed.valuePart && field.type === 'select' && field.options) {
				// Show value suggestions for select fields
				suggestions = {
					type: 'value',
					items: field.options.map((opt) => ({
						text: `${parsed.fieldPart}:${parsed.operatorPart}:${opt.value}`,
						label: opt.label,
						value: opt.value,
						description: 'option'
					})),
					currentField: field,
					currentOperator: parsed.operatorPart
				};
			} else if (parsed.isComplete) {
				// Show completion suggestion
				suggestions = {
					type: 'complete',
					items: [
						{
							text: input,
							label: `Add: ${field.label} ${getOperatorDisplay(parsed.operatorPart, field.type)} "${parsed.valuePart}"`,
							description: 'Press Enter to add'
						}
					],
					currentField: field,
					currentOperator: parsed.operatorPart
				};
			} else {
				showSuggestions = false;
				return;
			}
		}

		showSuggestions = suggestions.items.length > 0;
		selectedSuggestionIndex = -1;
	}

	// Handle input change
	function handleInputChange() {
		updateSuggestions(value);
	}

	// Handle key down events
	function handleKeyDown(event: KeyboardEvent) {
		if (showSuggestions && suggestions.items.length > 0) {
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					selectedSuggestionIndex = Math.min(
						selectedSuggestionIndex + 1,
						suggestions.items.length - 1
					);
					break;
				case 'ArrowUp':
					event.preventDefault();
					selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
					break;
				case 'Tab':
					event.preventDefault();
					if (selectedSuggestionIndex >= 0) {
						selectSuggestion(suggestions.items[selectedSuggestionIndex]);
					} else if (suggestions.items.length > 0) {
						selectSuggestion(suggestions.items[0]);
					}
					break;
				case 'Enter':
					event.preventDefault();
					if (selectedSuggestionIndex >= 0) {
						selectSuggestion(suggestions.items[selectedSuggestionIndex]);
					} else {
						handleEnterKey();
					}
					break;
				case 'Escape':
					showSuggestions = false;
					selectedSuggestionIndex = -1;
					break;
			}
		} else if (event.key === 'Enter') {
			event.preventDefault();
			handleEnterKey();
		}
	}

	// Handle Enter key press
	function handleEnterKey() {
		const parsed = parseCurrentInput(value);

		if (parsed.isFieldPattern && parsed.isComplete) {
			const field = fields.find(
				(f) =>
					f.key === parsed.fieldPart || f.label.toLowerCase() === parsed.fieldPart.toLowerCase()
			);

			if (field) {
				addCondition(field, parsed.operatorPart, parsed.valuePart);
				return;
			}
		}

		// If no structured pattern and allowRawSearch, add as raw search
		if (allowRawSearch && value.trim()) {
			addCondition(
				{ key: '_raw', label: 'Raw Search', type: 'text' } as SearchField,
				'like',
				value.trim()
			);
		}
	}

	// Select a suggestion
	function selectSuggestion(item: any) {
		if (suggestions.type === 'field') {
			value = item.text + ':';
			inputRef?.focus();
			updateSuggestions(value);
		} else if (suggestions.type === 'operator') {
			value = item.text;
			inputRef?.focus();
			updateSuggestions(value);
		} else if (suggestions.type === 'value') {
			value = item.text;
			inputRef?.focus();
			// Auto-complete when value is selected
			setTimeout(() => handleEnterKey(), 0);
		} else if (suggestions.type === 'complete') {
			handleEnterKey();
		}
	}

	// Add a condition
	function addCondition(field: SearchField, operator: string, conditionValue: string) {
		const condition: SearchCondition = {
			field: field.key,
			operator,
			value: conditionValue,
			label: field.label
		};

		conditions = [...conditions, condition];
		value = '';
		showSuggestions = false;
		dispatch('change', { conditions });
	}

	// Remove a condition
	function removeCondition(index: number) {
		conditions = conditions.filter((_, i) => i !== index);
		dispatch('change', { conditions });
	}

	// Clear all conditions
	function clearAll() {
		conditions = [];
		value = '';
		showSuggestions = false;
		dispatch('change', { conditions });
	}

	// Handle clicks outside to close suggestions
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node;

		// Check if the click is outside the input element
		const inputContainsTarget = inputRef && inputRef.contains && inputRef.contains(target);

		// Check if the click is outside the suggestions container
		const suggestionsContainsTarget = suggestionsContainer && suggestionsContainer.contains(target);

		if (!inputContainsTarget && !suggestionsContainsTarget) {
			showSuggestions = false;
		}
	}

	// Lifecycle
	$effect(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	// Helper to get operator display
	function getOperatorDisplay(operator: string, fieldType: string): string {
		const operators = (operatorsByType as Record<string, { key: string; label: string; description: string }[]>)[fieldType] || operatorsByType.text;
		const op = operators.find((o: { key: string }) => o.key === operator);
		return op?.label || operator;
	}
</script>

<div class="relative w-full">
	<!-- Search container with auto-expanding height -->
	<div
		class="group relative rounded-md border border-input bg-background transition-all duration-150 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
	>
		<!-- Search header with icon and input -->
		<div class="flex items-start gap-1.5 px-2 py-1.5">
			<SearchIcon class="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />

			<div class="min-w-0 flex-1">
				<!-- Condition badges - shown above input when present -->
				{#if conditions.length > 0}
					<div class="mb-2 flex flex-wrap gap-1.5">
						{#each conditions as condition, index (condition.field + condition.operator + condition.value + index)}
							<div
								class="group/badge inline-flex items-center gap-1 rounded border border-secondary/50 bg-secondary/50 px-2 py-0.5 text-xs transition-all duration-150 hover:bg-secondary/70"
							>
								{#if condition.field === '_raw'}
									<span class="font-medium text-muted-foreground">search:</span>
									<span class="font-medium">"{condition.value}"</span>
								{:else}
									<span class="font-semibold text-primary"
										>{condition.label || condition.field}</span
									>
									<span class="text-muted-foreground"
										>{getOperatorDisplay(condition.operator, 'text')}</span
									>
									<span
										class="rounded bg-background/50 px-1 py-0.5 font-mono text-xs text-foreground"
										>"{condition.value}"</span
									>
								{/if}
								<button
									class="ml-1 rounded-full p-1 opacity-60 transition-all duration-200 hover:bg-destructive/20 group-hover/badge:opacity-100"
									onclick={() => removeCondition(index)}
									aria-label="Remove condition"
								>
									<XIcon class="h-3 w-3" />
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Main input area -->
				<div class="flex min-h-[20px] items-center">
					<input
						bind:this={inputRef}
						bind:value
						placeholder={conditions.length > 0 ? 'Add another condition...' : placeholder}
						class="flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
						autocomplete="off"
						spellcheck="false"
						oninput={handleInputChange}
						onkeydown={handleKeyDown}
					/>
				</div>
			</div>

			<!-- Clear all button -->
			{#if conditions.length > 0 || value}
				<button
					class="shrink-0 rounded-full p-1 transition-colors hover:bg-muted"
					onclick={clearAll}
					aria-label="Clear all"
				>
					<XIcon class="h-3.5 w-3.5 opacity-70 hover:opacity-100" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Suggestions dropdown -->
	{#if showSuggestions}
		<div
			bind:this={suggestionsContainer}
			class="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-lg border bg-background shadow-lg backdrop-blur-sm"
		>
			<div class="p-2">
				{#each suggestions.items as item, index (item.text + index)}
					<button
						class={cn(
							'relative flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none transition-all duration-200',
							selectedSuggestionIndex === index
								? 'border border-primary/20 bg-primary/10 text-primary'
								: 'border border-transparent hover:bg-muted/50'
						)}
						onclick={() => selectSuggestion(item)}
					>
						<div class="flex flex-1 flex-col items-start gap-1">
							<div class="flex w-full items-center gap-2">
								<span class="font-medium">{item.label}</span>
								{#if suggestions.type === 'field'}
									<span
										class="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
									>
										{item.description}
									</span>
								{:else if suggestions.type === 'operator'}
									<span class="ml-auto text-xs text-muted-foreground">{item.description}</span>
								{:else if suggestions.type === 'complete'}
									<ChevronRightIcon class="ml-auto h-4 w-4 text-muted-foreground" />
								{/if}
							</div>
							{#if suggestions.type === 'field'}
								<span
									class="rounded bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground"
									>{item.text}:</span
								>
							{:else if suggestions.type === 'operator'}
								<span class="text-xs text-muted-foreground"
									>for {suggestions.currentField?.label}</span
								>
							{:else if suggestions.type === 'complete'}
								<span class="text-xs text-muted-foreground"
									>Press Enter or Tab to add this condition</span
								>
							{/if}
						</div>
						{#if selectedSuggestionIndex === index}
							<div class="ml-2 rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
								{suggestions.type === 'complete' ? '↵' : '⇥'}
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Help text -->
			{#if suggestions.type === 'field'}
				<div class="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
					<div class="flex items-center gap-4">
						<span
							>Type <code class="rounded border bg-background px-1.5 py-0.5 font-mono"
								>field:value</code
							></span
						>
						<span
							>or <code class="rounded border bg-background px-1.5 py-0.5 font-mono"
								>field:operator:value</code
							></span
						>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
