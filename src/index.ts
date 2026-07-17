import YAML from 'js-yaml';

interface Env {
	STATIC_BUCKET: R2Bucket;
	YECAO_PROVIDER_URL: string;
	LIANGXIN_PROVIDER_URL: string;
	XFLASH_PROVIDER_URL: string;
	TAILSCALE_AUTH_KEY: string;
	TAILSCALE_ADMIRAL_AUTH_KEY: string;
}

interface ProxyNode {
	name: string;
	type: string;
	server: string;
	port: number;
	password?: string;
	uuid?: string;
	sni?: string;
	servername?: string;
	tls?: boolean;
	flow?: string;
	network?: string;
	'ws-opts'?: {
		path?: string;
		headers?: Record<string, string>;
	};
	'grpc-opts'?: {
		'grpc-service-name'?: string;
	};
	'reality-opts'?: {
		'public-key'?: string;
		'short-id'?: string;
	};
	'client-fingerprint'?: string;
	'skip-cert-verify'?: boolean;
	[key: string]: any;
}

const clashUA = 'mihomo.party/v1.9.2 (clash.meta)';

interface ProviderConfig {
	name: string;
	url: string;
	addFlag: boolean;
}

interface ProviderResult {
	name: string;
	nodes: ProxyNode[];
	subscriptionUserinfo: string | null;
}

function buildProviderConfigs(env: Env): ProviderConfig[] {
	return [
		{ name: '野草', url: env.YECAO_PROVIDER_URL, addFlag: true },
		{ name: '良心云', url: env.LIANGXIN_PROVIDER_URL, addFlag: false },
		{ name: 'XFlash', url: env.XFLASH_PROVIDER_URL, addFlag: false },
	];
}

function createSeparator(name: string): ProxyNode {
	return {
		name,
		type: 'trojan',
		server: '127.0.0.1',
		port: 55555,
		password: '',
	};
}

function parseSubscriptionUserinfo(header: string | null): { remainingBytes: number; expire: number } | null {
	if (!header) return null;

	const parts = new Map(
		header.split(';').map((part) => {
			const [key, value] = part.split('=').map((piece) => piece.trim());
			return [key, Number(value)];
		}),
	);
	const upload = parts.get('upload');
	const download = parts.get('download');
	const total = parts.get('total');
	const expire = parts.get('expire');

	if ([upload, download, total, expire].some((value) => value === undefined || Number.isNaN(value))) {
		return null;
	}

	return {
		remainingBytes: Math.max(0, total! - download! - upload!),
		expire: expire!,
	};
}

function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function formatExpireDate(expire: number): string {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const parts = formatter.formatToParts(new Date(expire * 1000));
	const year = parts.find((part) => part.type === 'year')?.value;
	const month = parts.find((part) => part.type === 'month')?.value;
	const day = parts.find((part) => part.type === 'day')?.value;

	return `${year}-${month}-${day}`;
}

function buildProviderSeparatorName(name: string, subscriptionUserinfo: string | null): string {
	const info = parseSubscriptionUserinfo(subscriptionUserinfo);
	if (!info) return `---${name}---`;
	return `---${name} 剩余 ${formatBytes(info.remainingBytes)} 到期 ${formatExpireDate(info.expire)}---`;
}

async function loadProviderNodes(provider: ProviderConfig): Promise<ProviderResult> {
	const res = await fetch(provider.url, {
		headers: { 'User-Agent': clashUA },
	});
	const body = await res.text();
	let nodes: ProxyNode[] = [];

	try {
		const config = YAML.load(body) as { proxies?: ProxyNode[] } | null;
		nodes = config?.proxies || [];
	} catch (error) {
		console.warn(`failed to load provider yaml: ${provider.name}`, error);
		return {
			name: provider.name,
			nodes: [],
			subscriptionUserinfo: null,
		};
	}

	if (provider.addFlag) {
		for (const node of nodes) {
			node.name = countryFlag(node.name) + ' ' + node.name;
		}
	}

	return {
		name: provider.name,
		nodes,
		subscriptionUserinfo: res.headers.get('subscription-userinfo'),
	};
}

async function parseConfig(bucket: R2Bucket, providerConfigs: ProviderConfig[], addExtra: boolean = true): Promise<ProxyNode[]> {
	let proxies: ProxyNode[] = [];

	if (addExtra) {
		const extraFile = await bucket.get('extra_node.yml');
		if (extraFile) {
			const gigsText = await extraFile.text();
			const extraConfig: any = YAML.load(gigsText);
			for (const node of extraConfig.proxies || []) {
				node.name = countryFlag(node.name) + ' ' + node.name;
				proxies.push(node);
			}
		}

		proxies.push(createSeparator('---自建节点---'));
	}

	const providerResults = await Promise.all(providerConfigs.map((provider) => loadProviderNodes(provider)));

	for (const group of providerResults.filter((group) => group.nodes.length > 0)) {
		for (const node of group.nodes) {
			proxies.push(node);
		}
		proxies.push(createSeparator(buildProviderSeparatorName(group.name, group.subscriptionUserinfo)));
	}

	return proxies;
}

function countryFlag(country: string): string {
	if (country.includes('台湾')) return '🇹🇼';
	if (country.includes('香港')) return '🇭🇰';
	if (country.includes('新加坡')) return '🇸🇬';
	if (country.includes('美国')) return '🇺🇸';
	if (country.includes('英国')) return '🇬🇧';
	if (country.includes('加拿大')) return '🇨🇦';
	if (country.includes('澳大利亚')) return '🇦🇹';
	if (country.includes('日本')) return '🇯🇵';
	if (country.includes('韩国')) return '🇰🇷';
	if (country.includes('俄')) return '🇷🇺';
	if (country.includes('印度')) return '🇮🇳';
	if (country.includes('阿根廷')) return '🇦🇷';
	if (country.includes('欧洲')) return '🇪🇺';
	if (country.includes('土耳其')) return '🇹🇷';
	if (country.includes('马来西亚')) return '🇲🇾';
	if (country.includes('德国')) return '🇩🇪';
	if (country.includes('法国')) return '🇫🇷';
	if (country.includes('墨西哥')) return '🇲🇽';
	if (country.includes('巴西')) return '🇧🇷';
	if (country.includes('菲律宾')) return '🇵🇭';
	if (country.includes('印尼')) return '🇮🇩';
	if (country.includes('越南')) return '🇻🇳';
	if (country.includes('泰国')) return '🇹🇭';
	if (country.includes('沙特')) return '🇸🇦';
	return '❓';
}

async function wechat(): Promise<{ domains: string[]; ips: string[] }> {
	const res = await fetch('http://dns.weixin.qq.com/cgi-bin/micromsg-bin/newgetdns');
	const compressed = await res.arrayBuffer();
	const decompressed = new DecompressionStream('deflate-raw');
	const stream = new Response(compressed).body!.pipeThrough(decompressed);
	const text = await new Response(stream).text();

	console.log(text);
	const domainRegex = /<domain name="([^"]+)".*?>/g;
	const ipRegex = /<ip>([^<]+)<\/ip>/g;

	const domains = new Set<string>();
	const ips = new Set<string>();

	let match;
	while ((match = domainRegex.exec(text)) !== null) {
		if (match[1] !== 'localhost') domains.add(match[1]);
	}
	while ((match = ipRegex.exec(text)) !== null) {
		const ip = match[1].trim();
		if (ip !== '127.0.0.7') ips.add(ip);
	}

	return { domains: Array.from(domains), ips: Array.from(ips) };
}

async function handleSurge(env: Env): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	let result = '';
	for (const node of proxies) {
		if (node.type === 'trojan') {
			result += `${node.name}=trojan,${node.server},${node.port},password=${node.password}`;
			if (node.sni) result += `,sni=${node.sni}`;
			if (node.network === 'ws') result += ',ws=true';
			result += '\n';
		}
	}
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleClash(env: Env): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	const result = 'proxies:\n' + YAML.dump(proxies);
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleSingBox(env: Env, device?: string, authKey?: string): Promise<Response> {
	const proxies = await parseConfig(env.STATIC_BUCKET, buildProviderConfigs(env));
	let outBoundsTags = ['direct'];

	const templateFile = await env.STATIC_BUCKET.get('sing-box_template.json');
	if (!templateFile) {
		return new Response('sing-box_template.json not found', { status: 404 });
	}
	const templateText = await templateFile.text();
	const template = JSON.parse(templateText);

	if (device) {
		const isAdmiral = Boolean(authKey);
		const tailscaleAuthKey = authKey || env.TAILSCALE_AUTH_KEY;
		if (!tailscaleAuthKey) {
			return new Response('TAILSCALE_AUTH_KEY is not configured', { status: 500 });
		}
		const endpoint: Record<string, any> = {
			type: 'tailscale',
			tag: 'tailscale',
			auth_key: tailscaleAuthKey,
			hostname: `${device}-sing-box`,
			accept_routes: true,
		};
		if (device === 'eloxts-macbook-pro') {
			endpoint.advertise_routes = ['10.10.10.87/32', '10.10.10.51/32'];
		}
		template.endpoints.push(endpoint);

		const tailscaleRules = isAdmiral
			? [
					{
						ip_cidr: '10.0.0.0/24',
						outbound: 'tailscale',
					},
				]
			: [
					{
						type: 'logical',
						mode: 'and',
						rules: [{ ip_cidr: '10.1.1.0/24' }, { wifi_ssid: 'Eloxt' }],
						outbound: 'direct',
					},
					{
						ip_cidr: '10.1.1.0/24',
						outbound: 'tailscale',
					},
				];

		const lanIpIndex = template.route.rules.findIndex(
			(rule: any) =>
				rule?.rule_set === 'lan_ip' || (Array.isArray(rule?.rule_set) && rule.rule_set.includes('lan_ip')),
		);
		if (lanIpIndex === -1) {
			template.route.rules.push(...tailscaleRules);
		} else {
			template.route.rules.splice(lanIpIndex, 0, ...tailscaleRules);
		}
	}

	for (const proxy of proxies) {
		const result = convertToSingBox(proxy);
		template.outbounds.push(result);
		outBoundsTags.push(result.tag);
	}

	// add direct outbound
	template.outbounds.push({
		type: 'direct',
		tag: 'direct',
	});

	// Add selectors
	template.outbounds.push({
		tag: 'Proxy',
		type: 'selector',
		outbounds: outBoundsTags,
		interrupt_exist_connections: true
	});
	template.outbounds.push({
		tag: 'Speedtest',
		type: 'selector',
		outbounds: outBoundsTags,
		interrupt_exist_connections: true
	});
	template.outbounds.push({
		tag: 'AI',
		type: 'selector',
		outbounds: outBoundsTags,
		interrupt_exist_connections: true
	});
	template.outbounds.push({
		tag: 'Telegram',
		type: 'selector',
		outbounds: outBoundsTags,
		interrupt_exist_connections: true
	});
	template.outbounds.push({
		tag: 'Apple Service',
		type: 'selector',
		outbounds: outBoundsTags,
		interrupt_exist_connections: true
	});

	return new Response(JSON.stringify(template, null, 2), { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleWechatSurgeDomainset(): Promise<Response> {
	const { domains } = await wechat();
	let result = domains.map((d) => `DOMAIN-SUFFIX,${d}`).join('\n') + '\nDOMAIN-SUFFIX,paydns.wechat.com\n';
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleWechatClashDomainset(): Promise<Response> {
	const { domains } = await wechat();
	let result = 'payload:\n' + domains.map((d) => `  - DOMAIN-SUFFIX,${d}`).join('\n') + '\n  - DOMAIN-SUFFIX,paydns.wechat.com\n';
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleStatic(path: string, bucket: R2Bucket): Promise<Response> {
	const key = path.replace('/2774d2d9-d46b-4819-be0e-3d654270efcd/', '');
	const object = await bucket.get(key);

	if (!object) {
		return new Response('Not Found', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);

	return new Response(object.body, { headers });
}

function buildSingBoxTls(content: ProxyNode, enabled: boolean) {
	if (!enabled) return undefined;

	const tls: any = {
		enabled: true,
		server_name: content.sni || content.servername,
		insecure: content['skip-cert-verify'] || undefined,
	};

	if (content['client-fingerprint']) {
		tls.utls = {
			enabled: true,
			fingerprint: content['client-fingerprint'],
		};
	}

	if (content['reality-opts']?.['public-key']) {
		tls.reality = {
			enabled: true,
			public_key: content['reality-opts']['public-key'],
			short_id: content['reality-opts']['short-id'],
		};
	}

	return tls;
}

function buildSingBoxTransport(content: ProxyNode) {
	if (content.network === 'ws') {
		return {
			type: 'ws',
			path: content['ws-opts']?.path,
			headers: content['ws-opts']?.headers,
		};
	}

	if (content.network === 'grpc') {
		return {
			type: 'grpc',
			service_name: content['grpc-opts']?.['grpc-service-name'],
		};
	}

	return undefined;
}

function convertToSingBox(content: ProxyNode) {
	if (content.type === 'vless') {
		return {
			type: 'vless',
			tag: content.name,
			server: content.server,
			server_port: content.port,
			uuid: content.uuid,
			flow: content.flow,
			tls: buildSingBoxTls(content, content.tls === true || Boolean(content.sni || content.servername || content['reality-opts'])),
			transport: buildSingBoxTransport(content),
		};
	}

	return {
		type: 'trojan',
		tag: content.name,
		server: content.server,
		server_port: content.port,
		password: content.password,
		tls: buildSingBoxTls(content, true),
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3') return handleSurge(env);
		if (path === '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3/domainset/wechat.list') return handleWechatSurgeDomainset();
		if (path === '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737') return handleClash(env);
		if (path === '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737/domainset/wechat.yaml') return handleWechatClashDomainset();
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad') return handleSingBox(env);
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/mac') return handleSingBox(env, "eloxts-macbook-pro");
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/iphone') return handleSingBox(env, "eloxts-iphone");
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/ipad') return handleSingBox(env, "eloxts-ipad");
		if (path.startsWith('/sing-box/admiralxs/')) {
			const device = path.slice('/sing-box/admiralxs/'.length);
			return handleSingBox(env, device, env.TAILSCALE_ADMIRAL_AUTH_KEY);
		}
		if (path.startsWith('/2774d2d9-d46b-4819-be0e-3d654270efcd/')) return handleStatic(path, env.STATIC_BUCKET);

		return new Response('Not Found', { status: 404 });
	},
};
