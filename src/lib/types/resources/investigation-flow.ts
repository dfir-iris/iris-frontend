export type FlowTarget = 'alert' | 'alert_cluster' | 'both';

export interface FlowConditionLeaf {
	field: string;
	operator: string;
	value?: unknown;
}

export interface FlowConditionGroup {
	logic?: 'and' | 'or' | 'not';
	conditions: FlowConditionNode[];
}

// A condition node is either a leaf or a nested group — the DSL
// mirrors the alert cluster-rules one, and the recursion is what the UI
// builder relies on to author nested AND/OR trees.
export type FlowConditionNode = FlowConditionLeaf | FlowConditionGroup;

export interface FlowConditions {
	logic?: 'and' | 'or' | 'not';
	conditions: FlowConditionNode[];
}

// Kept the old exported name as an alias for backwards compat with
// any imports that came before nested groups landed.
export type FlowCondition = FlowConditionLeaf;

export interface InvestigationFlowStep {
	step_id: number;
	flow_id: number;
	step_order: number;
	step_title: string;
	step_description?: string | null;
	step_is_required: boolean;
}

export interface InvestigationFlow {
	flow_id: number;
	flow_uuid: string;
	flow_name: string;
	flow_description?: string | null;
	flow_is_active: boolean;
	flow_customer_scope: number[] | null;
	flow_target: FlowTarget;
	flow_conditions: FlowConditions;
	flow_priority: number;
	flow_created_by?: number | null;
	flow_created_at: string;
	flow_updated_at: string;
	steps: InvestigationFlowStep[];
}

export interface InvestigationProgress {
	id: number;
	alert_id?: number;
	cluster_id?: number;
	step_id: number;
	completed_by_user_id: number;
	completed_at: string;
	note?: string | null;
	completed_by?: { id: number; user_name: string; user_login: string };
}

// Kept the old name as an alias for existing imports while we roll the
// component out — the alert and alert cluster panels use the same overview
// payload shape, so a single type covers both.
export type AlertInvestigationProgress = InvestigationProgress;

export interface InvestigationOverview {
	flow_id: number | null;
	flow_name: string | null;
	steps: InvestigationFlowStep[];
	progress: InvestigationProgress[];
}

export type AlertInvestigationOverview = InvestigationOverview;

export interface DeployFlowResult {
	flow_id: number;
	alerts_attached: number;
	clusters_attached: number;
}
