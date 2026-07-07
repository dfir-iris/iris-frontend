// Historically we also had 'attach_flow'; that action was removed in
// favour of investigation flows carrying their own conditions. Rules
// only stack alerts into clusters now.
export type RuleAction = 'create_cluster';

export interface RuleConditionLeaf {
	field: string;
	operator: string;
	value?: unknown;
}

export interface RuleConditionGroup {
	logic?: 'and' | 'or' | 'not';
	conditions: RuleConditionNode[];
}

// A condition node is either a leaf `{field, operator, value}` or a
// nested group `{logic, conditions: [...]}`. The recursion is what
// enables authoring `(A and B) or (C and D)` through the UI builder.
export type RuleConditionNode = RuleConditionLeaf | RuleConditionGroup;

// Root of the DSL — a group plus optional stacking metadata used by
// the cluster-rules `create_cluster` action.
export interface RuleConditions {
	logic?: 'and' | 'or' | 'not';
	conditions: RuleConditionNode[];
	time_window_seconds?: number;
	group_by?: string[];
}

// Kept the old exported name as an alias — anything importing
// `RuleCondition` still resolves to the leaf shape.
export type RuleCondition = RuleConditionLeaf;

export interface ClusterRule {
	rule_id: number;
	rule_uuid: string;
	rule_name: string;
	rule_description?: string | null;
	rule_is_active: boolean;
	rule_priority: number;
	rule_customer_scope: number[] | null;
	rule_conditions: RuleConditions;
	rule_action_type: RuleAction;
	rule_action_config: {
		title_template?: string;
		description?: string;
		[key: string]: unknown;
	};
	rule_created_by?: number | null;
	rule_created_at: string;
	rule_updated_at: string;
}
