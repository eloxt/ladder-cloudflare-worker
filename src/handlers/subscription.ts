import YAML from 'js-yaml';
import { buildProviderConfigs, parseConfig } from '../proxies';
import type { Env } from '../types';

export async function handleSurge(env: Env): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
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
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	return new Response('proxies:\n' + YAML.dump(proxies), {
		headers: { 'Content-Type': 'text/plain;charset=utf-8' },
	});
}
