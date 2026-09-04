import YAML from 'js-yaml';
import type { AppConfig, Env, ProviderConfig } from './types';

const defaultClashTemplate = 'proxies: []\n';
const defaultSingBoxTemplate = JSON.stringify({ endpoints: [], inbounds: [], outbounds: [], route: { rules: [] } }, null, 2);

interface ConfigRow {
	providers: string;
	extra_nodes: string;
	tailscale_auth_key: string;
	tailscale_admiral_auth_key: string;
	clash_template: string;
	sing_box_template: string;
	updated_at: string;
}

export async function loadConfig(env: Env): Promise<AppConfig> {
	const row = await env.DB.prepare(
		'SELECT providers, extra_nodes, tailscale_auth_key, tailscale_admiral_auth_key, clash_template, sing_box_template, updated_at FROM app_config WHERE id = 1',
	).first<ConfigRow>();
	if (!row) {
		return {
			providers: [],
			extraNodes: 'proxies: []\n',
			tailscaleAuthKey: '',
			tailscaleAdmiralAuthKey: '',
			clashTemplate: defaultClashTemplate,
			singBoxTemplate: defaultSingBoxTemplate,
			updatedAt: null,
		};
	}
	return {
		providers: (JSON.parse(row.providers) as ProviderConfig[]).map((provider) => ({
			...provider,
			enabled: provider.enabled !== false,
		})),
		extraNodes: row.extra_nodes,
		tailscaleAuthKey: row.tailscale_auth_key,
		tailscaleAdmiralAuthKey: row.tailscale_admiral_auth_key,
		clashTemplate: row.clash_template,
		singBoxTemplate: row.sing_box_template,
		updatedAt: row.updated_at,
	};
}

export function validateConfig(value: unknown): AppConfig {
	if (!value || typeof value !== 'object') throw new Error('配置格式无效');
	const input = value as Partial<AppConfig>;
	if (!Array.isArray(input.providers) || input.providers.length > 50) throw new Error('订阅源数量必须在 0 到 50 之间');
	const ids = new Set<string>();
	const providers = input.providers.map((item) => {
		if (!item || typeof item !== 'object') throw new Error('订阅源格式无效');
		const provider = item as ProviderConfig;
		const name = String(provider.name || '').trim();
		const url = String(provider.url || '').trim();
		const id = String(provider.id || crypto.randomUUID());
		if (!name || name.length > 80) throw new Error('订阅名称不能为空且不能超过 80 个字符');
		if (ids.has(id)) throw new Error('订阅源 ID 不能重复');
		ids.add(id);
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error(`“${name}”的订阅地址无效`);
		}
		if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(`“${name}”的订阅地址仅支持 HTTP 或 HTTPS`);
		return { id, name, url, enabled: provider.enabled !== false, ...(provider.addFlag ? { addFlag: true } : {}) };
	});
	if (typeof input.extraNodes !== 'string' || typeof input.clashTemplate !== 'string' || typeof input.singBoxTemplate !== 'string') {
		throw new Error('节点和模板必须是文本');
	}
	if (typeof input.tailscaleAuthKey !== 'string' || input.tailscaleAuthKey.trim().length > 512) {
		throw new Error('Tailscale Key 不能超过 512 个字符');
	}
	const tailscaleAuthKey = input.tailscaleAuthKey.trim();
	if (typeof input.tailscaleAdmiralAuthKey !== 'string' || input.tailscaleAdmiralAuthKey.trim().length > 512) {
		throw new Error('Tailscale Admiral Key 不能超过 512 个字符');
	}
	const tailscaleAdmiralAuthKey = input.tailscaleAdmiralAuthKey.trim();
	const totalSize = new TextEncoder().encode(JSON.stringify(input)).byteLength;
	if (totalSize > 1024 * 1024) throw new Error('配置总大小不能超过 1 MiB');
	const extra = YAML.load(input.extraNodes) as { proxies?: unknown } | null;
	if (!extra || !Array.isArray(extra.proxies)) throw new Error('自建节点必须是包含 proxies 数组的 YAML');
	const clash = YAML.load(input.clashTemplate);
	if (!clash || typeof clash !== 'object' || Array.isArray(clash)) throw new Error('Clash 模板必须是 YAML 对象');
	const singBox = JSON.parse(input.singBoxTemplate) as Record<string, unknown>;
	if (!singBox || typeof singBox !== 'object' || Array.isArray(singBox)) throw new Error('sing-box 模板必须是 JSON 对象');
	if (!Array.isArray(singBox.outbounds) || !Array.isArray(singBox.inbounds) || !Array.isArray(singBox.endpoints)) {
		throw new Error('sing-box 模板必须包含 inbounds、outbounds 和 endpoints 数组');
	}
	const route = singBox.route as { rules?: unknown } | undefined;
	if (!route || !Array.isArray(route.rules)) throw new Error('sing-box 模板必须包含 route.rules 数组');
	return {
		providers,
		extraNodes: input.extraNodes,
		tailscaleAuthKey,
		tailscaleAdmiralAuthKey,
		clashTemplate: input.clashTemplate,
		singBoxTemplate: input.singBoxTemplate,
		updatedAt: null,
	};
}

export async function saveConfig(env: Env, config: AppConfig): Promise<AppConfig> {
	const updatedAt = new Date().toISOString();
	await env.DB.prepare(
		`INSERT INTO app_config (id, providers, extra_nodes, tailscale_auth_key, tailscale_admiral_auth_key, clash_template, sing_box_template, updated_at)
		 VALUES (1, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET providers = excluded.providers, extra_nodes = excluded.extra_nodes,
		 tailscale_auth_key = excluded.tailscale_auth_key, tailscale_admiral_auth_key = excluded.tailscale_admiral_auth_key,
		 clash_template = excluded.clash_template, sing_box_template = excluded.sing_box_template, updated_at = excluded.updated_at`,
	)
		.bind(
			JSON.stringify(config.providers),
			config.extraNodes,
			config.tailscaleAuthKey,
			config.tailscaleAdmiralAuthKey,
			config.clashTemplate,
			config.singBoxTemplate,
			updatedAt,
		)
		.run();
	return { ...config, updatedAt };
}
