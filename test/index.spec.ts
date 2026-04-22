import YAML from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

describe('parseConfig via clash endpoint', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('adds named separators for each non-empty provider group', async () => {
		const bucket = {
			get: vi.fn(async (key: string) => {
				if (key !== 'extra_node.yml') return null;
				return {
					text: async () => YAML.dump({ proxies: [{ name: '美国自建', type: 'trojan', server: 'self.example.com', port: 443, password: 'self' }] }),
				};
			}),
		};

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
					if (url.includes('provider-yecao')) {
						return new Response(
							YAML.dump({
								proxies: [{ name: '香港一号', type: 'trojan', server: 'hk.example.com', port: 443, password: 'hk' }],
							}),
							{
								headers: {
									'subscription-userinfo': 'upload=1704310932; download=72047148323; total=96636764160; expire=1804089600',
								},
							},
						);
					}
					if (url.includes('provider.example.test')) {
						return new Response(YAML.dump({ proxies: [] }));
					}
					if (url.includes('provider.example.test')) {
						return new Response(
						YAML.dump({
							proxies: [
								{ name: '新加坡一号', type: 'trojan', server: 'sg.example.com', port: 443, password: 'sg' },
								{ name: '日本一号', type: 'trojan', server: 'jp.example.com', port: 443, password: 'jp' },
								],
							}),
							{
								headers: {
									'subscription-userinfo': 'upload=0; download=1073741824; total=2147483648; expire=1893456000',
								},
							},
						);
					}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);

		const response = await worker.fetch(
			new Request('https://example.com/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737'),
			{ STATIC_BUCKET: bucket as unknown as R2Bucket } as never,
		);
		const config = YAML.load(await response.text()) as { proxies: Array<{ name: string; type: string; server: string; port: number }> };

		expect(config.proxies.map((proxy) => proxy.name)).toEqual([
			'🇺🇸 美国自建',
			'---自建节点---',
			'🇭🇰 香港一号',
			'---野草 剩余 21.31 GB 到期 2027-03-04---',
			'新加坡一号',
			'日本一号',
			'---XFlash 剩余 1.00 GB 到期 2030-01-01---',
		]);
		expect(config.proxies[2]).toEqual({
			name: '🇭🇰 香港一号',
			type: 'trojan',
			server: 'hk.example.com',
			port: 443,
			password: 'hk',
		});
		expect(config.proxies[3]).toEqual({
			name: '---野草 剩余 21.31 GB 到期 2027-03-04---',
			type: 'trojan',
			server: '127.0.0.1',
			port: 55555,
			password: '',
		});
		expect(config.proxies[6]).toEqual({
			name: '---XFlash 剩余 1.00 GB 到期 2030-01-01---',
			type: 'trojan',
			server: '127.0.0.1',
			port: 55555,
			password: '',
		});
	});

	it('skips a provider when its yaml payload cannot be parsed', async () => {
		const bucket = {
			get: vi.fn(async () => null),
		};

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('provider-yecao')) {
					return new Response('proxies: [');
				}
				if (url.includes('provider.example.test')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: '良心云一号', type: 'trojan', server: 'lx.example.com', port: 443, password: 'lx' }],
						}),
					);
				}
				if (url.includes('provider.example.test')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: 'XFlash一号', type: 'trojan', server: 'xf.example.com', port: 443, password: 'xf' }],
						}),
					);
				}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);

		const response = await worker.fetch(
			new Request('https://example.com/clash/dd32ef87-6f75-4d00-985b-21ec1fb2a737'),
			{ STATIC_BUCKET: bucket as unknown as R2Bucket } as never,
		);
		const config = YAML.load(await response.text()) as { proxies: Array<{ name: string }> };
		const names = config.proxies.map((proxy) => proxy.name);

		expect(names).toEqual(['---自建节点---', '良心云一号', '---良心云---', 'XFlash一号', '---XFlash---']);
		expect(names.some((name) => name.includes('野草'))).toBe(false);
	});
});
