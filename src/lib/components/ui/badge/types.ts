export type CaseStatus =
	| 'Pending'
	| 'In progress'
	| 'Completed'
	| 'Unspecified'
	| 'To do'
	| 'Open'
	| 'Closed'
	| 'Containment'
	| 'Eradication'
	| 'Recovery'
	| 'Post-Incident'
	| 'Reporting'
	| 'Merged'
	| 'Assigned'
	| 'New'
	| 'Started'
	| 'Cancelled'
	| 'On hold'
	| 'Done'
	| 'To be done';

export type Severity = 'Unspecified' | 'Low' | 'Medium' | 'High' | 'Critical';
