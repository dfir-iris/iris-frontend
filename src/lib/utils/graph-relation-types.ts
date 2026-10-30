/**
 * Settings → Graph relations: validation and request bodies of the
 * investigation graph relation-type catalogue (§4.9 / §9.6). Mirrors the
 * backend rules so the dialog can explain a refusal before sending.
 */
import type {
	GraphLineStyle,
	GraphRelationType,
	GraphRelationTypeInput
} from '$lib/types/resources/case-graph';

/** Backend rule: lower case, starts with a letter, 2–64 of `[a-z0-9_]`. */
export const RELATION_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
export const RELATION_LABEL_MAX = 128;
export const RELATION_DESCRIPTION_MAX = 4000;
export const STIX_RELATIONSHIP_RE = /^[a-z][a-z0-9-]{0,63}$/;
export const DEFAULT_STIX_RELATIONSHIP = 'related-to';

export const RELATION_LINE_STYLES: { value: GraphLineStyle; label: string }[] = [
	{ value: 'solid', label: 'Solid' },
	{ value: 'dashed', label: 'Dashed' },
	{ value: 'dotted', label: 'Dotted' }
];

export interface RelationTypeForm {
	name: string;
	label: string;
	description: string;
	directed: boolean;
	color: string;
	line_style: GraphLineStyle;
	stix_relationship: string;
}

export const blankRelationTypeForm = (): RelationTypeForm => ({
	name: '',
	label: '',
	description: '',
	directed: true,
	color: 'slate',
	line_style: 'solid',
	stix_relationship: DEFAULT_STIX_RELATIONSHIP
});

export const relationTypeToForm = (t: GraphRelationType): RelationTypeForm => ({
	name: t.name,
	label: t.label,
	description: t.description ?? '',
	directed: t.directed,
	color: t.color || 'slate',
	line_style: t.line_style || 'solid',
	stix_relationship: t.stix_relationship || DEFAULT_STIX_RELATIONSHIP
});

/** `Lateral movement` → `lateral_movement`; a leading digit gets an `r_` prefix. */
export const relationNameFromLabel = (label: string) => {
	const slug = label
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 64);
	if (!slug) return '';
	return (/^[a-z]/.test(slug) ? slug : `r_${slug}`).slice(0, 64);
};

/** First problem of the form, or null. `others` are the other types of the catalogue. */
export const validateRelationTypeForm = (
	form: RelationTypeForm,
	others: readonly Pick<GraphRelationType, 'name'>[]
): string | null => {
	const name = form.name.trim();
	const label = form.label.trim();
	if (!label) return 'Label is required';
	if (label.length > RELATION_LABEL_MAX) {
		return `Label must be at most ${RELATION_LABEL_MAX} characters`;
	}
	if (!RELATION_NAME_RE.test(name)) {
		return 'Name must be 2-64 lower case letters, digits or underscores, starting with a letter';
	}
	if (others.some((o) => o.name === name)) return `A relation type named "${name}" already exists`;
	if (form.description.length > RELATION_DESCRIPTION_MAX) {
		return `Description must be at most ${RELATION_DESCRIPTION_MAX} characters`;
	}
	const stix = form.stix_relationship.trim();
	if (stix && !STIX_RELATIONSHIP_RE.test(stix)) {
		return 'STIX relationship must be lower case words joined by hyphens (e.g. related-to)';
	}
	return null;
};

/**
 * Request body. A system type cannot be renamed, so its name is left out
 * (the backend refuses any `name` different from the stored one).
 */
export const relationTypeBody = (
	form: RelationTypeForm,
	original: Pick<GraphRelationType, 'is_system'> | null
): GraphRelationTypeInput => {
	const body: GraphRelationTypeInput = {
		label: form.label.trim(),
		description: form.description.trim() || null,
		directed: form.directed,
		color: form.color,
		line_style: form.line_style,
		stix_relationship: form.stix_relationship.trim() || DEFAULT_STIX_RELATIONSHIP
	};
	if (!original?.is_system) body.name = form.name.trim();
	return body;
};

/** Why a type cannot be deleted, or null when it can. */
export const relationTypeDeleteBlocker = (
	t: Pick<GraphRelationType, 'is_system' | 'edge_count'>
): string | null => {
	if (t.is_system) return 'Built-in relation types cannot be deleted';
	const used = t.edge_count ?? 0;
	if (used > 0) return `Used by ${used} relation${used === 1 ? '' : 's'} in cases`;
	return null;
};

/** Copy of `list` with the item at `from` moved to `to` (unchanged when out of range). */
export const moveItem = <T>(list: readonly T[], from: number, to: number): T[] => {
	if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
		return [...list];
	}
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item);
	return next;
};

export const sortRelationTypes = <T extends Pick<GraphRelationType, 'sort_order' | 'id'>>(
	list: readonly T[]
) => [...list].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
