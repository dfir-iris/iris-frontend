<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BoldIcon,
		CodeIcon,
		Heading1Icon,
		Heading2Icon,
		Heading3Icon,
		ItalicIcon,
		LinkIcon,
		ListIcon,
		ListOrderedIcon,
		QuoteIcon,
		StrikethroughIcon
	} from 'lucide-svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Markdown } from 'tiptap-markdown';

	let { value, onChange, onSave } = $props<{
		value: string;
		onChange: (v: string) => void;
		onSave: () => void;
	}>();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = null;
	let skipUpdate = false;

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] }
				}),
				Link.configure({
					openOnClick: false,
					HTMLAttributes: { class: 'text-blue-500 underline' }
				}),
				Placeholder.configure({
					placeholder: 'Write a comment…'
				}),
				Markdown
			],
			content: value ?? '',
			editorProps: {
				attributes: {
					class: 'outline-none min-h-[5rem] px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none'
				},
				handleKeyDown: (_view, event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
						onSave();
						return true;
					}

					if ((event.metaKey || event.ctrlKey) && event.key === 's') {
						event.preventDefault();
						onSave();
						return true;
					}

					return false;
				}
			},
			onUpdate: ({ editor: e }) => {
				skipUpdate = true;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onChange((e.storage as any).markdown.getMarkdown());
			}
		});
	});

	$effect(() => {
		if (!editor || skipUpdate) {
			skipUpdate = false;
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentMd = (editor.storage as any).markdown.getMarkdown();

		if ((value ?? '') !== currentMd) {
			editor.commands.setContent(value ?? '');
		}
	});

	onDestroy(() => editor?.destroy());

	const btn = (active: boolean) =>
		`rounded p-1 transition-colors ${active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`;
</script>

<div class="flex flex-col overflow-hidden rounded-md border border-border/50">
	<div class="flex items-center gap-0.5 border-b border-border/30 bg-muted/30 px-1.5 py-1">
		<button
			class={btn(editor?.isActive('bold') ?? false)}
			onclick={() => editor?.chain().focus().toggleBold().run()}
		>
			<BoldIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('italic') ?? false)}
			onclick={() => editor?.chain().focus().toggleItalic().run()}
		>
			<ItalicIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('strike') ?? false)}
			onclick={() => editor?.chain().focus().toggleStrike().run()}
		>
			<StrikethroughIcon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class={btn(editor?.isActive('heading', { level: 1 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
		>
			<Heading1Icon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('heading', { level: 2 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
		>
			<Heading2Icon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('heading', { level: 3 }) ?? false)}
			onclick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
		>
			<Heading3Icon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class={btn(editor?.isActive('bulletList') ?? false)}
			onclick={() => editor?.chain().focus().toggleBulletList().run()}
		>
			<ListIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('orderedList') ?? false)}
			onclick={() => editor?.chain().focus().toggleOrderedList().run()}
		>
			<ListOrderedIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('blockquote') ?? false)}
			onclick={() => editor?.chain().focus().toggleBlockquote().run()}
		>
			<QuoteIcon size="12" />
		</button>

		<button
			class={btn(editor?.isActive('codeBlock') ?? false)}
			onclick={() => editor?.chain().focus().toggleCodeBlock().run()}
		>
			<CodeIcon size="12" />
		</button>

		<div class="mx-0.5 h-3.5 w-px bg-border/50"></div>

		<button
			class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => {
				const url = window.prompt('URL');
				if (url) editor?.chain().focus().setLink({ href: url }).run();
			}}
		>
			<LinkIcon size="12" />
		</button>
	</div>

	<div bind:this={editorElement} class="bg-background"></div>
</div>

<style>
	:global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		pointer-events: none;
		height: 0;
		color: hsl(var(--muted-foreground) / 0.5);
	}
</style>
