import { buildProviderConfigs, parseConfig } from '../proxies';
import type { Env, ProxyNode } from '../types';

function buildTls(node: ProxyNode, enabled: boolean) {
	if (!enabled) return undefined;
	const tls: Record<string, any> = { enabled: true, server_name: node.sni || node.servername, insecure: node['skip-cert-verify'] || undefined };
	if (node['client-fingerprint']) tls.utls = { enabled: true, fingerprint: node['client-fingerprint'] };
	if (node['reality-opts']?.['public-key']) {
		tls.reality = { enabled: true, public_key: node['reality-opts']['public-key'], short_id: node['reality-opts']['short-id'] };
	}
	return tls;
}

function buildTransport(node: ProxyNode) {
	if (node.network === 'ws') return { type: 'ws', path: node['ws-opts']?.path, headers: node['ws-opts']?.headers };
	if (node.network === 'grpc') return { type: 'grpc', service_name: node['grpc-opts']?.['grpc-service-name'] };
	return undefined;
}

function convertToSingBox(node: ProxyNode) {
	if (node.type === 'vless') {
		return {
			type: 'vless', tag: node.name, server: node.server, server_port: node.port, uuid: node.uuid, flow: node.flow,
			tls: buildTls(node, node.tls === true || Boolean(node.sni || node.servername || node['reality-opts'])), transport: buildTransport(node),
		};
	}
	if (node.type === 'anytls') {
		return {
			type: 'anytls', tag: node.name, server: node.server, server_port: node.port, password: node.password, tls: buildTls(node, true),
		};
	}
	return { type: 'trojan', tag: node.name, server: node.server, server_port: node.port, password: node.password, tls: buildTls(node, true) };
}

function addTailscaleConfiguration(template: any, device: string, authKey: string, isAdmiral: boolean): void {
	template.endpoints.push({
		type: 'tailscale', tag: 'tailscale', auth_key: authKey, hostname: `${device}-sing-box`, accept_routes: true,
		...(device === 'eloxts-macbook-pro' ? { advertise_routes: ['10.10.10.87/32', '10.10.10.51/32'] } : {}),
	});
	const rules = isAdmiral
		? [{ ip_cidr: '10.0.0.0/24', outbound: 'tailscale' }]
		: [
				{ type: 'logical', mode: 'and', rules: [{ ip_cidr: '10.1.1.0/24' }, { wifi_ssid: 'Eloxt' }], outbound: 'direct' },
				{ ip_cidr: '10.1.1.0/24', outbound: 'tailscale' },
			];
	const lanIpIndex = template.route.rules.findIndex(
		(rule: any) => rule?.rule_set === 'lan_ip' || (Array.isArray(rule?.rule_set) && rule.rule_set.includes('lan_ip')),
	);
	if (lanIpIndex === -1) template.route.rules.push(...rules);
	else template.route.rules.splice(lanIpIndex, 0, ...rules);
}

export async function handleSingBox(env: Env, device?: string, authKey?: string): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	const templateFile = await env.STATIC_BUCKET.get('sing-box_template.json');
	if (!templateFile) return new Response('sing-box_template.json not found', { status: 404 });
	const template = JSON.parse(await templateFile.text());
	if (device) {
		const tailscaleAuthKey = authKey || env.TAILSCALE_AUTH_KEY;
		if (!tailscaleAuthKey) return new Response('TAILSCALE_AUTH_KEY is not configured', { status: 500 });
		addTailscaleConfiguration(template, device, tailscaleAuthKey, Boolean(authKey));

		if (device === 'wrt') {
			const tunInbound = template.inbounds.find((inbound: any) => inbound?.type === 'tun');
			if (tunInbound) tunInbound.auto_route = true;
		}
	}

	const outboundTags = ['direct'];
	for (const proxy of proxies) {
		const outbound = convertToSingBox(proxy);
		template.outbounds.push(outbound);
		outboundTags.push(outbound.tag);
	}
	template.outbounds.push({ type: 'direct', tag: 'direct' });
	for (const tag of ['Proxy', 'Speedtest', 'AI', 'Telegram']) {
		template.outbounds.push({ tag, type: 'selector', outbounds: outboundTags, interrupt_exist_connections: true });
	}
	return new Response(JSON.stringify(template, null, 2), { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}
