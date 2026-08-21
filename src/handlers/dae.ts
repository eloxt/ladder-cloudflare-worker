import { buildProviderConfigs, parseConfig } from '../proxies';
import type { Env, ProxyNode } from '../types';

const DEFAULT_GEOSITE_FILE = 'surge-geosite.dat';
const DEFAULT_GEOIP_FILE = 'surge-geoip.dat';
export const DAE_DATA_PATH = '/dae-data/9be9df29-87b8-4c56-a7f7-2a6c32de0b4a';
const DAE_DATA_PREFIX = `${DAE_DATA_PATH}/`;
const DAE_DATA_KEYS = new Set([DEFAULT_GEOSITE_FILE, DEFAULT_GEOIP_FILE, 'manifest.json']);

function text(value: unknown): string {
	return value === undefined || value === null ? '' : String(value);
}

function quote(value: string): string {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function authority(server: string, port: number): string {
	const host = server.includes(':') && !server.startsWith('[') ? `[${server}]` : server;
	return `${host}:${port}`;
}

function query(parameters: Array<[string, unknown]>): string {
	const search = new URLSearchParams();
	for (const [key, value] of parameters) {
		if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
	}
	const encoded = search.toString();
	return encoded ? `?${encoded}` : '';
}

function fragment(link: string, name: string): string {
	return `${link}#${encodeURIComponent(name)}`;
}

function tlsParameters(node: ProxyNode): Array<[string, unknown]> {
	const parameters: Array<[string, unknown]> = [];
	const sni = node.sni || node.servername;
	if (sni) parameters.push(['sni', sni]);
	if (node['client-fingerprint']) parameters.push(['fp', node['client-fingerprint']]);
	if (node['skip-cert-verify']) parameters.push(['allowInsecure', 1]);
	if (node['reality-opts']?.['public-key']) parameters.push(['pbk', node['reality-opts']['public-key']]);
	if (node['reality-opts']?.['short-id']) parameters.push(['sid', node['reality-opts']['short-id']]);
	return parameters;
}

function transportParameters(node: ProxyNode): Array<[string, unknown]> {
	const parameters: Array<[string, unknown]> = [['type', node.network || 'tcp']];
	if (node.network === 'ws') {
		parameters.push(['path', node['ws-opts']?.path]);
		parameters.push(['host', node['ws-opts']?.headers?.Host || node['ws-opts']?.headers?.host]);
	}
	if (node.network === 'grpc') parameters.push(['serviceName', node['grpc-opts']?.['grpc-service-name']]);
	return parameters;
}

function convertVless(node: ProxyNode): string {
	const security = node['reality-opts']?.['public-key'] ? 'reality' : node.tls || node.sni || node.servername ? 'tls' : 'none';
	return fragment(
		`vless://${encodeURIComponent(text(node.uuid))}@${authority(node.server, node.port)}${query([
			['encryption', 'none'],
			['security', security],
			['flow', node.flow],
			...tlsParameters(node),
			...transportParameters(node),
		])}`,
		node.name,
	);
}

function convertTrojan(node: ProxyNode): string {
	return fragment(
		`trojan://${encodeURIComponent(text(node.password))}@${authority(node.server, node.port)}${query([
			['security', node.tls === false ? 'none' : 'tls'],
			...tlsParameters(node),
			...transportParameters(node),
		])}`,
		node.name,
	);
}

function convertAnyTls(node: ProxyNode): string {
	return fragment(
		`anytls://${encodeURIComponent(text(node.password))}@${authority(node.server, node.port)}/${query([
			['sni', node.sni || node.servername],
			['insecure', node['skip-cert-verify'] ? 1 : undefined],
		]).replace(/^\?/, '?')}`,
		node.name,
	);
}

function base64Url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function convertShadowsocks(node: ProxyNode): string {
	const credential = `${text(node.cipher || node.method)}:${text(node.password)}`;
	const link = `ss://${base64Url(credential)}@${authority(node.server, node.port)}`;
	return fragment(link, node.name);
}

function convertVmess(node: ProxyNode): string {
	const payload = {
		v: '2',
		ps: node.name,
		add: node.server,
		port: node.port,
		id: node.uuid,
		aid: node.alterId ?? 0,
		scy: node.cipher || 'auto',
		net: node.network || 'tcp',
		type: node['http-opts']?.method || 'none',
		host: node['ws-opts']?.headers?.Host || node['ws-opts']?.headers?.host || node.servername,
		path: node['ws-opts']?.path,
		tls: node.tls ? 'tls' : '',
		sni: node.sni || node.servername,
		fp: node['client-fingerprint'],
	};
	return fragment(`vmess://${base64Url(JSON.stringify(payload))}`, node.name);
}

function convertHysteria2(node: ProxyNode): string {
	return fragment(
		`hysteria2://${encodeURIComponent(text(node.password))}@${authority(node.server, node.port)}/${query([
			['sni', node.sni || node.servername],
			['insecure', node['skip-cert-verify'] ? 1 : undefined],
			['obfs', node.obfs],
			['obfs-password', node['obfs-password']],
		])}`,
		node.name,
	);
}

function convertTuic(node: ProxyNode): string {
	return fragment(
		`tuic://${encodeURIComponent(text(node.uuid))}:${encodeURIComponent(text(node.password))}@${authority(node.server, node.port)}${query([
			['sni', node.sni || node.servername],
			['congestion_control', node['congestion-controller'] || node['congestion-control']],
			['udp_relay_mode', node['udp-relay-mode']],
			['alpn', Array.isArray(node.alpn) ? node.alpn.join(',') : node.alpn],
			['allow_insecure', node['skip-cert-verify'] ? 1 : undefined],
		])}`,
		node.name,
	);
}

/** Convert a Clash-compatible proxy object to a dae-supported URI. */
export function convertToDaeNode(node: ProxyNode): string | null {
	const type = node.type.toLowerCase();
	if (!node.server || !node.port) return null;
	if (type === 'vless') return convertVless(node);
	if (type === 'trojan') return convertTrojan(node);
	if (type === 'anytls') return convertAnyTls(node);
	if (type === 'ss' || type === 'shadowsocks') return convertShadowsocks(node);
	if (type === 'vmess') return convertVmess(node);
	if (type === 'hysteria2' || type === 'hy2') return convertHysteria2(node);
	if (type === 'tuic') return convertTuic(node);
	if (type === 'http' || type === 'https' || type === 'socks5' || type === 'socks') {
		const scheme = type === 'socks' ? 'socks5' : type;
		const credentials = node.username ? `${encodeURIComponent(node.username)}:${encodeURIComponent(text(node.password))}@` : '';
		return fragment(`${scheme}://${credentials}${authority(node.server, node.port)}`, node.name);
	}
	return null;
}

function splitTags(value: string | undefined, fallback: string[]): string[] {
	const tags = (value || fallback.join(','))
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
	return [...new Set(tags)];
}

function extRules(file: string, tags: string[], matcher: 'domain' | 'dip', action: string): string[] {
	return tags.map((tag) => `${matcher}(ext:${quote(`${file}:${tag}`)}) -> ${action}`);
}

type DaeRule = {
	file: 'geosite' | 'geoip';
	matcher: 'domain' | 'dip';
	tags: string[];
	target: string;
};

/**
 * Keep the default dae routing aligned with the sing-box template used by the
 * other subscription endpoint. Rules whose source group is not present in
 * SukkaW/Surge are intentionally not invented here.
 */
const DEFAULT_DAE_RULES: DaeRule[] = [
	{ file: 'geosite', matcher: 'domain', tags: ['speedtest'], target: 'Speedtest' },
	{ file: 'geosite', matcher: 'domain', tags: ['cdn'], target: 'proxy' },
	{ file: 'geosite', matcher: 'domain', tags: ['ai', 'apple-intelligence'], target: 'AI' },
	{ file: 'geosite', matcher: 'domain', tags: ['telegram'], target: 'Telegram' },
	{ file: 'geosite', matcher: 'domain', tags: ['apple-cn', 'icloud-private-relay', 'microsoft'], target: 'direct' },
	{ file: 'geosite', matcher: 'domain', tags: ['non-ip-cdn'], target: 'proxy' },
	{ file: 'geosite', matcher: 'domain', tags: ['non-ip-domestic', 'direct'], target: 'direct' },
	{ file: 'geosite', matcher: 'domain', tags: ['global'], target: 'proxy' },
	{ file: 'geoip', matcher: 'dip', tags: ['lan', 'domestic'], target: 'direct' },
	{ file: 'geoip', matcher: 'dip', tags: ['ip-cdn'], target: 'proxy' },
];

function buildMappedRules(geositeFile: string, geoipFile: string): string[] {
	return DEFAULT_DAE_RULES.flatMap((rule) =>
		extRules(rule.file === 'geosite' ? geositeFile : geoipFile, rule.tags, rule.matcher, rule.target),
	);
}

export function buildDaeConfig(proxies: ProxyNode[], env: Env, dataBaseUrl = `https://config.eloxt.com${DAE_DATA_PREFIX}`): string {
	const geositeFile = env.DAE_GEOSITE_FILE || DEFAULT_GEOSITE_FILE;
	const geoipFile = env.DAE_GEOIP_FILE || DEFAULT_GEOIP_FILE;
	const blockTags = splitTags(env.DAE_BLOCK_TAGS, []);
	const directTags = splitTags(env.DAE_DIRECT_TAGS, []);
	const nodeLines: string[] = [];
	const skipped: string[] = [];
	const names = new Set<string>();
	for (const node of proxies) {
		if (node.name.startsWith('---')) continue;
		if (names.has(node.name)) {
			let index = 2;
			while (names.has(`${node.name} ${index}`)) index++;
			node.name = `${node.name} ${index}`;
		}
		names.add(node.name);
		const uri = convertToDaeNode(node);
		if (uri) nodeLines.push(`\t${quote(uri)}`);
		else skipped.push(`${node.name} (${node.type})`);
	}

	const rules = [
		...extRules(geositeFile, blockTags, 'domain', 'block'),
		...extRules(geoipFile, blockTags, 'dip', 'block'),
		...buildMappedRules(geositeFile, geoipFile),
		...extRules(geositeFile, directTags, 'domain', 'direct'),
		...extRules(geoipFile, directTags, 'dip', 'direct'),
	];
	const comments = [
		'# Generated by ladder-cloudflare-worker. Refresh this URL to rebuild the node list.',
		`# Download rules: curl -fL ${dataBaseUrl}${DEFAULT_GEOSITE_FILE} -o ${geositeFile}`,
		`#                curl -fL ${dataBaseUrl}${DEFAULT_GEOIP_FILE} -o ${geoipFile}`,
		...skipped.map((node) => `# Skipped unsupported node: ${node}`),
	];

	return [
		...comments,
		'',
		'global {',
		'\tlog_level: info',
		'\tdial_mode: domain',
		'\ttls_implementation: utls',
		'\tutls_imitate: chrome_auto',
		'\tallow_insecure: false',
		'\ttcp_check_url: \'http://cp.cloudflare.com\'',
		'\tcheck_interval: 30s',
		'}',
		'',
		'node {',
		...(nodeLines.length ? nodeLines : ['\t# No convertible nodes were returned by providers.']),
		'}',
		'',
		'group {',
		'\tproxy {',
		'\t\tpolicy: min_moving_avg',
		'\t}',
		'\tSpeedtest {',
		'\t\tpolicy: min_moving_avg',
		'\t}',
		'\tAI {',
		'\t\tpolicy: min_moving_avg',
		'\t}',
		'\tTelegram {',
		'\t\tpolicy: min_moving_avg',
		'\t}',
		'}',
		'',
		'dns {',
		'\tupstream {',
		"\t\talidns: 'udp://dns.alidns.com:53'",
		"\t\tgoogledns: 'tcp+udp://dns.google:53'",
		'\t}',
		'\trouting {',
		'\t\trequest {',
		'\t\t\tqname(geosite:cn) -> alidns',
		'\t\t\tfallback: googledns',
		'\t\t}',
		'\t}',
		'}',
		'',
		'routing {',
		'\tpname(NetworkManager) -> direct',
		'\tdip(224.0.0.0/3, \'ff00::/8\') -> direct',
		'\tdip(geoip:private) -> direct',
		'\tdomain(geosite:cn) -> direct',
		'\tdomain(hgj.com, hgj.net) -> direct',
		...rules.map((rule) => `\t${rule}`),
		'\tfallback: proxy',
		'}',
		'',
	].join('\n');
}

export async function handleDaeRequest(env: Env, request: Request): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	const dataBaseUrl = new URL(`${DAE_DATA_PATH}/`, request.url).toString();
	const body = buildDaeConfig(proxies, env, dataBaseUrl);
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain;charset=utf-8',
			'Content-Disposition': 'inline; filename="config.dae"',
			'Cache-Control': 'no-store',
		},
	});
}

export async function handleDaeData(path: string, bucket: R2Bucket, method = 'GET'): Promise<Response> {
	if (!path.startsWith(DAE_DATA_PREFIX)) return new Response('Not Found', { status: 404 });
	const key = path.slice(DAE_DATA_PREFIX.length);
	if (!DAE_DATA_KEYS.has(key)) return new Response('Not Found', { status: 404 });

	const object = await bucket.get(`dae-dat/${key}`);
	if (!object) return new Response('Not Found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('cache-control', headers.get('cache-control') || 'public, max-age=300, must-revalidate');
	if (!headers.has('content-type')) {
		headers.set('content-type', key.endsWith('.json') ? 'application/json;charset=utf-8' : 'application/octet-stream');
	}
	return new Response(method === 'HEAD' ? null : object.body, { headers });
}
