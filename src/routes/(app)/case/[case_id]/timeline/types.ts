export type TimelineFilterData = {
	title: string;
	description: string;
	source: string;
	tag: string;
	asset: string;
	ioc: string;
	category: string;
	startDate: string;
	endDate: string;
	flag: string;
};

export type TimelineFilterFieldValue = TimelineFilterData[keyof TimelineFilterData];
