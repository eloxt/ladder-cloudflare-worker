import YAML from 'js-yaml';
import { loadConfig } from '../config';
import { parseConfig } from '../proxies';
import type { Env } from '../types';

export async function handleSurge(env: Env): Promise<Response> {
	const config = await loadConfig(env);
	const proxies = await parseConfig(config.providers, config.extraNodes);
	let result = '';
	for (const node of proxies) {
		if (node.type !== 'trojan') continue;
		result += `${node.name}=trojan,${node.server},${node.port},password=${node.password}`;
		if (node.sni) result += `,sni=${node.sni}`;
		if (node.network === 'ws') result += ',ws=true';
		result += '\n';
	}
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

export async function handleClash(env: Env): Promise<Response> {
	const config = await loadConfig(env);
	const proxies = await parseConfig(config.providers, config.extraNodes);
	const template = YAML.load(config.clashTemplate) as Record<string, unknown>;
	template.proxies = proxies;
	return new Response(YAML.dump(template), {
		headers: { 'Content-Type': 'text/plain;charset=utf-8' },
	});
}

export async function handleClashTemplate(env: Env): Promise<Response> {
	const config = await loadConfig(env);
	return new Response(config.clashTemplate, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/yaml;charset=utf-8',
		},
	});
}
