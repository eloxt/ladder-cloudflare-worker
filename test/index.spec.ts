import YAML from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAE_DATA_PATH, buildDaeConfig, convertToDaeNode, handleDaeData } from '../src/handlers/dae';
import worker from '../src/index';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

function createEnv(bucket: R2Bucket): WorkerEnv {
	return {
		STATIC_BUCKET: bucket,
		YECAO_PROVIDER_URL: 'https://provider.example.test/yecao',
		LIANGXIN_PROVIDER_URL: 'https://provider.example.test/liangxin',
		XFLASH_PROVIDER_URL: 'https://provider.example.test/xflash',
		TAILSCALE_AUTH_KEY: 'test-tailscale-auth-key',
	};
}

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
					if (url.includes('/yecao')) {
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
					if (url.includes('/liangxin')) {
						return new Response(YAML.dump({ proxies: [] }));
					}
					if (url.includes('/xflash')) {
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
			createEnv(bucket as unknown as R2Bucket),
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
				if (url.includes('/yecao')) {
					return new Response('proxies: [');
				}
				if (url.includes('/liangxin')) {
					return new Response(
						YAML.dump({
							proxies: [{ name: '良心云一号', type: 'trojan', server: 'lx.example.com', port: 443, password: 'lx' }],
						}),
					);
				}
				if (url.includes('/xflash')) {
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
			createEnv(bucket as unknown as R2Bucket),
		);
		const config = YAML.load(await response.text()) as { proxies: Array<{ name: string }> };
		const names = config.proxies.map((proxy) => proxy.name);

		expect(names).toEqual(['---自建节点---', '良心云一号', '---良心云---', 'XFlash一号', '---XFlash---']);
		expect(names.some((name) => name.includes('野草'))).toBe(false);
	});
});

describe('sing-box conversion', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('converts vless nodes to sing-box outbounds', async () => {
		const bucket = {
			get: vi.fn(async (key: string) => {
				if (key === 'extra_node.yml') {
					return {
						text: async () =>
							YAML.dump({
								proxies: [
									{
										name: '美国 VLESS',
										type: 'vless',
										server: 'vless.example.com',
										port: 443,
										uuid: 'bf000d23-0752-40b4-affe-68f7707a9661',
										tls: true,
										servername: 'cdn.example.com',
										network: 'ws',
										'ws-opts': {
											path: '/ws',
											headers: {
												Host: 'cdn.example.com',
											},
										},
										'client-fingerprint': 'chrome',
									},
								],
							}),
					};
				}
				if (key === 'sing-box_template.json') {
					return {
						text: async () =>
							JSON.stringify({
								endpoints: [],
								route: {
									rules: [],
								},
								outbounds: [],
							}),
					};
				}
				return null;
			}),
		};

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(YAML.dump({ proxies: [] }))),
		);

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			createEnv(bucket as unknown as R2Bucket),
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇺🇸 美国 VLESS');

		expect(outbound).toEqual({
			type: 'vless',
			tag: '🇺🇸 美国 VLESS',
			server: 'vless.example.com',
			server_port: 443,
			uuid: 'bf000d23-0752-40b4-affe-68f7707a9661',
			tls: {
				enabled: true,
				server_name: 'cdn.example.com',
				utls: {
					enabled: true,
					fingerprint: 'chrome',
				},
			},
			transport: {
				type: 'ws',
				path: '/ws',
				headers: {
					Host: 'cdn.example.com',
				},
			},
		});
	});

	it('converts vless tcp reality nodes to sing-box outbounds', async () => {
		const bucket = {
			get: vi.fn(async (key: string) => {
				if (key === 'extra_node.yml') {
					return {
						text: async () =>
							YAML.dump({
								proxies: [
									{
										name: '美国 Mock VLESS',
										type: 'vless',
										server: '203.0.113.10',
										port: 443,
										uuid: '11111111-2222-4333-8444-555555555555',
										network: 'tcp',
										tls: true,
										udp: true,
										flow: 'xtls-rprx-vision',
										servername: 'stream.example.com',
										'client-fingerprint': 'chrome',
										'reality-opts': {
											'public-key': 'mockRealityPublicKeyForSingBoxTest1234567890',
											'short-id': '0123456789abcdef',
										},
									},
								],
							}),
					};
				}
				if (key === 'sing-box_template.json') {
					return {
						text: async () =>
							JSON.stringify({
								endpoints: [],
								route: {
									rules: [],
								},
								outbounds: [],
							}),
					};
				}
				return null;
			}),
		};

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(YAML.dump({ proxies: [] }))),
		);

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			createEnv(bucket as unknown as R2Bucket),
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇺🇸 美国 Mock VLESS');

		expect(outbound).toEqual({
			type: 'vless',
			tag: '🇺🇸 美国 Mock VLESS',
			server: '203.0.113.10',
			server_port: 443,
			uuid: '11111111-2222-4333-8444-555555555555',
			flow: 'xtls-rprx-vision',
			tls: {
				enabled: true,
				server_name: 'stream.example.com',
				utls: {
					enabled: true,
					fingerprint: 'chrome',
				},
				reality: {
					enabled: true,
					public_key: 'mockRealityPublicKeyForSingBoxTest1234567890',
					short_id: '0123456789abcdef',
				},
			},
		});
	});

	it('converts anytls nodes to sing-box outbounds', async () => {
		const bucket = {
			get: vi.fn(async (key: string) => {
				if (key === 'extra_node.yml') {
					return {
						text: async () =>
							YAML.dump({
								proxies: [
									{
										name: '澳大利亚',
										type: 'anytls',
										server: '03.giant.au.example.com',
										port: 443,
										password: 'example',
										'client-fingerprint': 'firefox',
										sni: 'dss0.bdstatic.com',
										'skip-cert-verify': true,
									},
								],
							}),
					};
				}
				if (key === 'sing-box_template.json') {
					return { text: async () => JSON.stringify({ endpoints: [], route: { rules: [] }, outbounds: [] }) };
				}
				return null;
			}),
		};

		vi.stubGlobal('fetch', vi.fn(async () => new Response(YAML.dump({ proxies: [] }))));

		const response = await worker.fetch(
			new Request('https://example.com/sing-box/5f1ba618-dfbc-46cb-a4a5-697fa7f849ad'),
			createEnv(bucket as unknown as R2Bucket),
		);
		const config = (await response.json()) as { outbounds: any[] };
		const outbound = config.outbounds.find((item) => item.tag === '🇦🇹 澳大利亚');

		expect(outbound).toEqual({
			type: 'anytls',
			tag: '🇦🇹 澳大利亚',
			server: '03.giant.au.example.com',
			server_port: 443,
			password: 'example',
			tls: {
				enabled: true,
				server_name: 'dss0.bdstatic.com',
				insecure: true,
				utls: { enabled: true, fingerprint: 'firefox' },
			},
		});
	});
});

describe('dae conversion', () => {
	it('converts vless reality and anytls nodes to dae URIs', () => {
		const vless = convertToDaeNode({
			name: '🇭🇰 Reality',
			type: 'vless',
			server: '203.0.113.10',
			port: 443,
			uuid: '11111111-2222-4333-8444-555555555555',
			tls: true,
			servername: 'edge.example.com',
			network: 'tcp',
			flow: 'xtls-rprx-vision',
			'reality-opts': { 'public-key': 'public-key', 'short-id': '0123456789abcdef' },
			'client-fingerprint': 'chrome',
		});
		const anytls = convertToDaeNode({
			name: '🇸🇬 AnyTLS',
			type: 'anytls',
			server: 'anytls.example.com',
			port: 443,
			password: 'secret',
			sni: 'cdn.example.com',
		});

		expect(vless).toContain('vless://11111111-2222-4333-8444-555555555555@203.0.113.10:443?');
		expect(vless).toContain('security=reality');
		expect(vless).toContain('pbk=public-key');
		expect(vless).toContain('%F0%9F%87%AD');
		expect(anytls).toContain('anytls://secret@anytls.example.com:443/?sni=cdn.example.com');
	});

	it('builds a complete dae config and skips separator nodes', () => {
		const config = buildDaeConfig(
			[
				{ name: '🇭🇰 Trojan', type: 'trojan', server: 'hk.example.com', port: 443, password: 'secret' },
				{ name: '---野草---', type: 'trojan', server: '127.0.0.1', port: 55555, password: '' },
			],
			{
				DAE_GEOSITE_FILE: 'surge-geosite.dat',
				DAE_GEOIP_FILE: 'surge-geoip.dat',
				DAE_BLOCK_TAGS: 'reject',
				STATIC_BUCKET: {} as R2Bucket,
				YECAO_PROVIDER_URL: '',
				LIANGXIN_PROVIDER_URL: '',
				XFLASH_PROVIDER_URL: '',
				TAILSCALE_AUTH_KEY: '',
			} as any,
			'https://config.eloxt.com/dae-data/test-token/',
		);

		expect(config).toContain('node {');
		expect(config).toContain('trojan://secret@hk.example.com:443');
		expect(config).not.toContain('127.0.0.1:55555');
		expect(config).toContain('domain(ext:\'surge-geosite.dat:reject\') -> block');
		expect(config).toContain('domain(ext:\'surge-geosite.dat:speedtest\') -> Speedtest');
		expect(config).toContain('domain(ext:\'surge-geosite.dat:ai\') -> AI');
		expect(config).toContain('domain(ext:\'surge-geosite.dat:telegram\') -> Telegram');
		expect(config).toContain('domain(ext:\'surge-geosite.dat:global\') -> proxy');
		expect(config).toContain('dip(ext:\'surge-geoip.dat:domestic\') -> direct');
		expect(config).toContain('dip(ext:\'surge-geoip.dat:ip-cdn\') -> proxy');
		expect(config).toContain('group {\n\tproxy {');
		expect(config).toContain('\tSpeedtest {');
		expect(config).toContain('\tAI {');
		expect(config).toContain('\tTelegram {');
		expect(config).toContain('domain(geosite:cn) -> direct');
		expect(config).toContain('domain(hgj.com, hgj.net) -> direct');
		expect(config).toContain('fallback: proxy');
		expect(config).toContain('https://config.eloxt.com/dae-data/test-token/surge-geosite.dat');
	});

	it('serves only the generated dat objects from R2', async () => {
		const bucket = {
			get: vi.fn(async (key: string) => {
				if (key !== 'dae-dat/surge-geosite.dat') return null;
				return {
					body: new Response('dat').body,
					httpEtag: '"etag"',
					writeHttpMetadata(headers: Headers) {
						headers.set('content-type', 'application/octet-stream');
					},
				};
			}),
		};

		const response = await handleDaeData(`${DAE_DATA_PATH}/surge-geosite.dat`, bucket as unknown as R2Bucket);
		const denied = await handleDaeData(`${DAE_DATA_PATH}/private.txt`, bucket as unknown as R2Bucket);

		expect(response.status).toBe(200);
		expect(response.headers.get('etag')).toBe('"etag"');
		expect(await response.text()).toBe('dat');
		expect(denied.status).toBe(404);
	});
});
