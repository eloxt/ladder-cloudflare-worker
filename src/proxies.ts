import YAML from 'js-yaml';
import type { Env, ProxyNode } from './types';

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

const clashUserAgent = 'mihomo.party/v1.9.2 (clash.meta)';

export function buildProviderConfigs(env: Env): ProviderConfig[] {
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
		headers: { 'User-Agent': clashUserAgent },
	});
	const body = await res.text();
	let nodes: ProxyNode[] = [];

	try {
		const config = YAML.load(body) as { proxies?: ProxyNode[] } | null;
		nodes = config?.proxies || [];
	} catch (error) {
		console.warn(`failed to load provider yaml: ${provider.name}`, error);
		return { name: provider.name, nodes: [], subscriptionUserinfo: null };
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

export async function parseConfig(bucket: R2Bucket, providerConfigs: ProviderConfig[], addExtra = true): Promise<ProxyNode[]> {
	const proxies: ProxyNode[] = [];

	if (addExtra) {
		const extraFile = await bucket.get('extra_node.yml');
		if (extraFile) {
			const extraConfig = YAML.load(await extraFile.text()) as { proxies?: ProxyNode[] };
			for (const node of extraConfig.proxies || []) {
				node.name = countryFlag(node.name) + ' ' + node.name;
				proxies.push(node);
			}
		}

		proxies.push(createSeparator('---自建节点---'));
	}

	const providerResults = await Promise.all(providerConfigs.map(loadProviderNodes));
	for (const group of providerResults.filter((group) => group.nodes.length > 0)) {
		proxies.push(...group.nodes, createSeparator(buildProviderSeparatorName(group.name, group.subscriptionUserinfo)));
	}

	return proxies;
}

export function countryFlag(country: string): string {
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
