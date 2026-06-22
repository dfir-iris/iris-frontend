<!--
  Section-aware quick-add button. Sits next to the generic "Add Item"
  dropdown in the case topbar and lets the user create the kind of item
  that matches the page they're on (Add Note on /notes, Add Task on
  /tasks, etc). Renders nothing on routes where there's no obvious
  "primary add" (case home, graph, war-room, activity).
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import {
		BiohazardIcon,
		CheckCheckIcon,
		ComputerIcon,
		DatabaseIcon,
		FileIcon,
		FileLock2Icon,
		PlusIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import {
		DATASTORE_PANEL_CTX,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import { newAsset } from '../assets/helpers';
	import { newIoc } from '../iocs/helpers';
	import { newNote } from '../notes/helpers';
	import { newTask } from '../tasks/helpers';
	import { newEvidence } from '../evidence/helpers';

	type SectionKey = 'notes' | 'assets' | 'iocs' | 'tasks' | 'evidence' | 'datastore' | 'timeline';

	type SectionAction = {
		label: string;
		Icon: typeof PlusIcon;
		run: () => void | Promise<void>;
	};

	const caseNotes = getContext<CaseNotesContext>(CASE_NOTES_CTX);
	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);
	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);
	const caseDatastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);
	const datastorePanel = getContext<DatastorePanelContext>(DATASTORE_PANEL_CTX);

	// Map the active route segment to the matching create action. We key
	// off the second segment under /case/<id> so deep links like
	// /case/123/notes/45 still resolve to "Add Note".
	const section = $derived.by<SectionKey | null>(() => {
		const path = page.url?.pathname ?? '';
		const match = path.match(/^\/case\/[^/]+\/([^/]+)/);
		const seg = match?.[1];
		if (seg === 'notes') return 'notes';
		if (seg === 'assets') return 'assets';
		if (seg === 'iocs') return 'iocs';
		if (seg === 'tasks') return 'tasks';
		if (seg === 'evidence') return 'evidence';
		if (seg === 'datastore') return 'datastore';
		if (seg === 'timeline') return 'timeline';
		return null;
	});

	const SECTION_ACTIONS: Record<SectionKey, SectionAction> = {
		notes: { label: 'Add Note', Icon: FileIcon, run: () => newNote(caseNotes) },
		assets: { label: 'Add Asset', Icon: ComputerIcon, run: () => newAsset(caseAssets) },
		iocs: { label: 'Add IOC', Icon: BiohazardIcon, run: () => newIoc(caseIocs) },
		tasks: { label: 'Add Task', Icon: CheckCheckIcon, run: () => newTask(caseTasks) },
		evidence: { label: 'Add Evidence', Icon: FileLock2Icon, run: () => newEvidence(caseEvidences) },
		datastore: {
			label: 'Add File',
			Icon: DatabaseIcon,
			run: () => {
				// Mirrors the dropdown behaviour: open the side panel so the new
				// file is visible right after upload.
				datastorePanel.open();
				caseDatastore.ui.showAddFileModal = true;
			}
		},
		// Timeline doesn't expose a context-level newEvent helper — the page
		// owns the dialog. Triggering the "Add" affordance fires a custom
		// event the page listens for.
		timeline: {
			label: 'Add Event',
			Icon: PlusIcon,
			run: () => {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('case-timeline:add-event'));
				}
			}
		}
	};

	const action = $derived(section ? SECTION_ACTIONS[section] : null);
</script>

{#if action}
	<Button
		variant="outline"
		size="sm"
		class="h-8 gap-x-1"
		onclick={() => void action.run()}
	>
		<action.Icon size={16} />
		<span class="hidden lg:inline">{action.label}</span>
	</Button>
{/if}
