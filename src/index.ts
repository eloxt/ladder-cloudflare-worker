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

let yecaoProvider = 'https://provider.example.test/56820/c/proxyproviders?auth=redacted-auth-token&v=t';
let xflashProvider = 'https://provider.example.test/xflash';
let clashUA = 'ClashforWindows/0.19.8';

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
	}

	const res1 = await fetch(yecaoProvider, {
		headers: { 'User-Agent': clashUA },
	});
	const body1 = await res1.text();
	const config1: any = YAML.load(body1);

	const res2 = await fetch(xflashProvider, {
		headers: { 'User-Agent': clashUA },
	});
	const body2 = await res2.text();
	const config2: any = YAML.load(body2);

	for (const node of config1.proxies || []) {
		node.name = countryFlag(node.name) + ' ' + node.name;
		proxies.push(node);
	}

	for (const node of config2.proxies || []) {
		proxies.push(node);
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

async function handleSingBox(bucket: R2Bucket): Promise<Response> {
	const proxies = await parseConfig(bucket);
	let outBoundsTags = ['direct'];

	const templateFile = await bucket.get('sing-box_template.json');
	if (!templateFile) {
		return new Response('sing-box_template.json not found', { status: 404 });
	}
	const templateText = await templateFile.text();
	const template = JSON.parse(templateText);

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
	});
	template.outbounds.push({
		tag: 'Speedtest',
		type: 'selector',
		outbounds: outBoundsTags,
	});
	template.outbounds.push({
		tag: 'AI',
		type: 'selector',
		outbounds: outBoundsTags,
	});
	template.outbounds.push({
		tag: 'Telegram',
		type: 'selector',
		outbounds: outBoundsTags,
	});
	template.outbounds.push({
		tag: 'Apple Service',
		type: 'selector',
		outbounds: outBoundsTags,
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
		if (path.startsWith('/2774d2d9-d46b-4819-be0e-3d654270efcd/')) return handleStatic(path, env.STATIC_BUCKET);

		return new Response('Not Found', { status: 404 });
	},
};
