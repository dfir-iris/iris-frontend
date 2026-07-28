/**
 * Module-scoped rune store for the runtime config fetched at boot.
 *
 * The boot fetch in `src/hooks.client.ts` populates this store once;
 * every component that needs to gate on `chatbot.enabled` or read the
 * MCP endpoint URL derives from `runtimeConfig.state` without a
 * per-component fetch. Values are frozen after boot — a settings
 * change requires a full reload, matching how error-reporting and MCP
 * toggles already behave.
 */
import {
	type RuntimeChatbot,
	type RuntimeConfig,
	type RuntimeErrorReporting,
	type RuntimeMcp
} from '$lib/observability/runtime-config';

const DEFAULT: RuntimeConfig = {
	error_reporting: {
		enabled: false,
		dsn: null,
		environment: null,
		sample_rate: 1.0,
		release: 'iris@unknown'
	},
	mcp: { enabled: false, endpoint: '/api/v2/mcp' },
	chatbot: { enabled: false, provider_available: false, model: '' }
};

const state = $state<{ config: RuntimeConfig }>({ config: DEFAULT });

export const runtimeConfig = {
	get state(): RuntimeConfig {
		return state.config;
	},
	get errorReporting(): RuntimeErrorReporting {
		return state.config.error_reporting;
	},
	get mcp(): RuntimeMcp {
		return state.config.mcp;
	},
	get chatbot(): RuntimeChatbot {
		return state.config.chatbot;
	},
	/**
	 * Called once at boot from `hooks.client.ts` after `fetchRuntimeConfig`
	 * resolves. Idempotent — safe to call twice, second call clobbers
	 * with the newer value (used by test harnesses that swap the config).
	 */
	set(config: RuntimeConfig): void {
		state.config = config;
	}
};
