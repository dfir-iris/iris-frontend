export type Access = {
	name: string;
	level: number;
};

export type CaseAccessProps = {
	onDelete: () => void;
	onClose: () => void;
};
