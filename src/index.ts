import YAML from 'js-yaml';

interface Env {
	STATIC_BUCKET: R2Bucket;
}

interface ProxyNode {
	name: string;
	type: string;
	server: string;
	port: number;
	password?: string;
	sni?: string;
	network?: string;
	[key: string]: any;
}

let yecaoProvider = 'https://provider.example.test/yecao';
let liangxinProvider = 'https://provider.example.test/liangxin';
let xflashProvider = 'https://provider.example.test/xflash';
let clashUA = 'mihomo.party/v1.9.2 (clash.meta)';
let tailscaleAuthKey = 'test-tailscale-auth-key';

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

async function parseConfig(bucket: R2Bucket, addExtra: boolean = true): Promise<ProxyNode[]> {
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

	const providerResults = await Promise.all([
		loadProviderNodes({ name: '野草', url: yecaoProvider, addFlag: true }),
		loadProviderNodes({ name: '良心云', url: liangxinProvider, addFlag: false }),
		loadProviderNodes({ name: 'XFlash', url: xflashProvider, addFlag: false }),
	]);

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

async function handleSurge(bucket: R2Bucket): Promise<Response> {
	const proxies = await parseConfig(bucket);
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

async function handleClash(bucket: R2Bucket): Promise<Response> {
	const proxies = await parseConfig(bucket);
	const result = 'proxies:\n' + YAML.dump(proxies);
	return new Response(result, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

async function handleSingBox(bucket: R2Bucket, device?: string): Promise<Response> {
	const proxies = await parseConfig(bucket);
	let outBoundsTags = ['direct'];

	const templateFile = await bucket.get('sing-box_template.json');
	if (!templateFile) {
		return new Response('sing-box_template.json not found', { status: 404 });
	}
	const templateText = await templateFile.text();
	const template = JSON.parse(templateText);

	if (device) {
		let endpoint = {
      type: "tailscale",
      tag: "tailscale",
      auth_key: tailscaleAuthKey,
      hostname: `${device}-sing-box`,
      accept_routes: true
    }
		template.endpoints.push(endpoint)
	} else {
		template.route.rules = template.route.rules.filter((rule: any) => {
			const isDirectWifiRule =
				rule?.type === 'logical' &&
				rule?.mode === 'and' &&
				rule?.outbound === 'direct' &&
				Array.isArray(rule?.rules) &&
				rule.rules.length === 2 &&
				rule.rules.some((item: any) => item?.ip_cidr === '10.1.1.0/24') &&
				rule.rules.some((item: any) => item?.wifi_ssid === 'Eloxt');

			const isTailscaleRoute =
				rule?.ip_cidr === '10.1.1.0/24' &&
				rule?.outbound === 'tailscale';

			return !isDirectWifiRule && !isTailscaleRoute;
		});
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

function convertToSingBox(content: ProxyNode) {
	return {
		type: 'trojan',
		tag: content.name,
		server: content.server,
		server_port: content.port,
		password: content.password,
		tls: {
			enabled: true,
			server_name: content.sni,
		},
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3') return handleSurge(env.STATIC_BUCKET);
		if (path === '/surge/1fa98d7a-c0dc-49be-8022-85014f3dbac3/domainset/wechat.list') return handleWechatSurgeDomainset();
		if (path === '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737') return handleClash(env.STATIC_BUCKET);
		if (path === '/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737/domainset/wechat.yaml') return handleWechatClashDomainset();
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad') return handleSingBox(env.STATIC_BUCKET);
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/mac') return handleSingBox(env.STATIC_BUCKET, "eloxts-macbook-pro");
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/iphone') return handleSingBox(env.STATIC_BUCKET, "eloxts-iphone");
		if (path === '/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad/ipad') return handleSingBox(env.STATIC_BUCKET, "eloxts-ipad");
		if (path.startsWith('/2774d2d9-d46b-4819-be0e-3d654270efcd/')) return handleStatic(path, env.STATIC_BUCKET);

		return new Response('Not Found', { status: 404 });
	},
};
