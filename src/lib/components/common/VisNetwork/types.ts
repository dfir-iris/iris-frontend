import type { IdType } from 'vis-network';

export type VisNodeDetails = {
	id?: IdType;
	group?: string;
	label?: string;
	title?: string | HTMLElement;
	image?: string;
};

export type VisNode = Record<string, unknown> & VisNodeDetails;
export type VisEdge = Record<string, unknown>;
