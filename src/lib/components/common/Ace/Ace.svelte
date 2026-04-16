<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BoldIcon,
		CodeIcon,
		Heading1Icon,
		Heading2Icon,
		Heading3Icon,
		ImageIcon,
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
	import Image from '@tiptap/extension-image';
	import Placeholder from '@tiptap/extension-placeholder';
	import { Markdown } from 'tiptap-markdown';
	import { Step } from '@tiptap/pm/transform';
	import { ApiService } from '$lib/services/api.service';
	import { auth } from '$lib/stores/auth.store';
	import { io, type Socket } from 'socket.io-client';
	import { env } from '$env/dynamic/public';

	let { value, onChange, onSave, caseId, savedAt, onRemoteSave } = $props<{
		value: string;
		onChange: (v: string) => void;
		onSave: () => void;
		caseId?: number | string | null;
		savedAt?: number;
		onRemoteSave?: (content: string) => void;
	}>();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = null;
	let skipUpdate = false;
	let uploading = $state(false);
	let typingUser = $state<string | null>(null);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;

	// --- Socket.IO collaboration ---
	let socket: Socket | null = null;
	// Flag: true when applying remote changes OR prop-sync setContent — prevents
	// re-emitting on the socket and prevents onChange from firing back to the parent.
	let suppressLocal = false;
	const channel = $derived(caseId ? `case-${caseId}` : null);

	const connectSocket = () => {
		if (!caseId || !channel) return;

		const token = auth.getAccessToken();
		const baseUrl = env.PUBLIC_EXTERNAL_API_URL?.replace(/\/$/, '') ?? '';

		socket = io(baseUrl, {
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			transports: ['polling', 'websocket']
		});

		socket.on('connect', () => {
			socket?.emit('join', { channel });
		});

		socket.on('connect_error', (err) => {
			console.error('Socket connection error:', err.message);
		});

		socket.on('change', (data: { steps?: unknown[]; channel?: string; last_change?: string }) => {
			if (!editor || !data.steps?.length) return;

			// Show typing indicator
			if (data.last_change) {
				typingUser = data.last_change;
				if (typingTimeout) clearTimeout(typingTimeout);
				typingTimeout = setTimeout(() => (typingUser = null), 2000);
			}

			suppressLocal = true;
			try {
				const tr = editor.state.tr;
				for (const stepJson of data.steps) {
					const step = Step.fromJSON(editor.state.schema, stepJson as Record<string, unknown>);
					tr.step(step);
				}
				editor.view.dispatch(tr);
			} catch (e) {
				// Steps couldn't be applied (e.g. position mismatch from concurrent edits).
				// Fall back to a full re-fetch of the description so clients converge.
				console.warn('Collab step apply failed, requesting full sync', e);
			} finally {
				suppressLocal = false;
			}
		});

		socket.on('save', (data: { content?: string; last_saved?: string }) => {
			typingUser = null;

			if (!data.content || !editor) return;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const localMd = (editor.storage as any).markdown.getMarkdown() as string;

			if (localMd !== data.content) {
				// Out of sync — replace content with what was saved
				suppressLocal = true;
				try {
					editor.commands.setContent(data.content);
				} finally {
					suppressLocal = false;
				}
			}

			// Tell parent to mark as saved (sets baseDescription = caseDescription)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const md = (editor.storage as any).markdown.getMarkdown() as string;
			onChange(md);
			onRemoteSave?.(md);
		});
	};

	const disconnectSocket = () => {
		socket?.disconnect();
		socket = null;
	};

	// --- Image upload ---
	const uploadImage = async (file: File): Promise<string | null> => {
		if (!caseId) return null;

		const base64 = await new Promise<string>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(';base64,')[1]);
			};
			reader.readAsDataURL(file);
		});

		const filename = file.name || `image-${Date.now()}.png`;

		const res = await ApiService.post<{ file_url: string }>(
			`/datastore/file/add-interactive?cid=${caseId}`,
			{ file_content: base64, file_original_name: filename },
			{ useApiPrefix: false }
		);

		if (res.ok && res.data && typeof res.data === 'object' && 'file_url' in res.data) {
			return (res.data as { file_url: string }).file_url;
		}

		const d = res.data as Record<string, unknown> | null;
		if (d && typeof d === 'object' && 'data' in d) {
			const inner = d.data as Record<string, unknown>;
			if (inner && typeof inner === 'object' && 'file_url' in inner) {
				return inner.file_url as string;
			}
		}

		return null;
	};

	const handleImageUpload = async (file: File) => {
		if (!editor || !caseId) return;

		uploading = true;
		try {
			const url = await uploadImage(file);
			if (url) {
				editor.chain().focus().setImage({ src: url, alt: file.name || 'image' }).run();
			}
		} finally {
			uploading = false;
		}
	};

	const handlePaste = (_view: unknown, event: ClipboardEvent) => {
		if (!caseId) return false;

		const items = event.clipboardData?.items;
		if (!items) return false;

		for (const item of items) {
			if (item.kind === 'file' && item.type.startsWith('image/')) {
				event.preventDefault();
				const file = item.getAsFile();
				if (file) handleImageUpload(file);
				return true;
			}
		}

		return false;
	};

	const handleDrop = (_view: unknown, event: DragEvent) => {
		if (!caseId) return false;

		const files = event.dataTransfer?.files;
		if (!files?.length) return false;

		for (const file of files) {
			if (file.type.startsWith('image/')) {
				event.preventDefault();
				handleImageUpload(file);
				return true;
			}
		}

		return false;
	};

	const triggerFileInput = () => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) handleImageUpload(file);
		};
		input.click();
	};

	// --- Editor setup ---
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
				Image.configure({
					inline: true,
					allowBase64: false
				}),
				Placeholder.configure({
					placeholder: 'Write a comment…'
				}),
				Markdown
			],
			content: value ?? '',
			editorProps: {
				attributes: {
					class: 'outline-none min-h-[5rem] px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_blockquote]:my-2 [&_pre]:my-2'
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
				},
				handlePaste,
				handleDrop
			},
			onTransaction: ({ transaction }) => {
				if (suppressLocal || !transaction.docChanged || !socket?.connected || !channel) return;

				const steps = transaction.steps.map((step) => step.toJSON());
				socket.emit('change', { steps, channel });
			},
			onUpdate: ({ editor: e }) => {
				// Don't push changes back to parent during remote or prop-sync updates
				if (suppressLocal) return;

				skipUpdate = true;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onChange((e.storage as any).markdown.getMarkdown());
			}
		});

		if (caseId) {
			connectSocket();
		}
	});

	// Emit socket save when parent signals a successful save
	let prevSavedAt = 0;
	$effect(() => {
		const ts = savedAt ?? 0;
		if (ts && ts !== prevSavedAt && socket?.connected && channel && editor) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const md = (editor.storage as any).markdown.getMarkdown() as string;
			socket.emit('save', { channel, content: md });
		}
		prevSavedAt = ts;
	});

	// Sync editor content when value prop changes externally
	$effect(() => {
		const v = value ?? '';

		if (!editor) return;

		if (skipUpdate) {
			skipUpdate = false;
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentMd = (editor.storage as any).markdown.getMarkdown();

		if (v !== currentMd) {
			suppressLocal = true;
			try {
				editor.commands.setContent(v);
			} finally {
				suppressLocal = false;
			}
		}
	});

	onDestroy(() => {
		disconnectSocket();
		editor?.destroy();
	});

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

		{#if caseId}
			<button
				class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				disabled={uploading}
				onclick={triggerFileInput}
			>
				<ImageIcon size="12" />
			</button>
		{/if}

		{#if typingUser}
			<span class="ml-auto text-2xs text-muted-foreground">{typingUser} is typing…</span>
		{/if}
	</div>

	<div class="relative">
		<div bind:this={editorElement} class="bg-background"></div>

		{#if uploading}
			<div class="absolute inset-0 flex items-center justify-center bg-background/60">
				<span class="text-xs text-muted-foreground">Uploading image…</span>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(.tiptap p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		pointer-events: none;
		height: 0;
		color: hsl(var(--muted-foreground) / 0.5);
	}

	:global(.tiptap img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.375rem;
	}
</style>
