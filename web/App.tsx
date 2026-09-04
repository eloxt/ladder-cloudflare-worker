import { FormEvent, lazy, Suspense, useEffect, useState } from 'react';
import { ApiError, requestJson } from './api';
import { ProviderEditor } from './ProviderEditor';
import { TailscaleEditor } from './TailscaleEditor';
import type { AppConfig } from './types';

type Panel = 'providers' | 'nodes' | 'tailscale' | 'templates';
type Template = 'clash' | 'singbox';

const CodeEditor = lazy(() => import('./CodeEditor').then((module) => ({ default: module.CodeEditor })));

export default function App() {
	const [config, setConfig] = useState<AppConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [loginError, setLoginError] = useState('');
	const [loggingIn, setLoggingIn] = useState(false);
	const [panel, setPanel] = useState<Panel>('providers');
	const [template, setTemplate] = useState<Template>('clash');
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState('');

	useEffect(() => {
		requestJson<AppConfig>('/admin/api/config')
			.then((data) => setConfig(data))
			.catch((error) => {
				setConfig(null);
				if (!(error instanceof ApiError && error.status === 401)) setLoginError(error instanceof Error ? error.message : '读取配置失败');
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(''), 2400);
		return () => window.clearTimeout(timer);
	}, [toast]);

	if (loading) {
		return <main className="loading" aria-label="正在加载" />;
	}

	if (!config) {
		async function login(event: FormEvent<HTMLFormElement>) {
			event.preventDefault();
			setLoginError('');
			setLoggingIn(true);
			const form = new FormData(event.currentTarget);
			try {
				await requestJson('/admin/api/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ password: form.get('password') }),
				});
				setConfig(await requestJson<AppConfig>('/admin/api/config'));
			} catch (error) {
				setLoginError(error instanceof Error ? error.message : '登录失败');
			} finally {
				setLoggingIn(false);
			}
		}

		return (
			<main className="login">
				<div className="wordmark"><strong>Ladder</strong><span>Configuration</span></div>
				<form className="login-card" onSubmit={login}>
					<p className="login-kicker">Private workspace</p>
					<h1>进入配置中心</h1>
					<p className="login-copy">管理订阅、自建节点以及客户端模板。</p>
					<label htmlFor="password">管理员密码</label>
					<input id="password" name="password" className="field" type="password" autoComplete="current-password" required autoFocus />
					<button className="primary" type="submit" disabled={loggingIn}>{loggingIn ? '正在验证…' : '继续'}</button>
					<div className="error" role="alert">{loginError}</div>
				</form>
				<div className="login-footer">config.eloxt.com</div>
			</main>
		);
	}

	function update(changes: Partial<AppConfig>) {
		setConfig((current) => current && { ...current, ...changes });
		setDirty(true);
	}

	async function save() {
		if (!config) return;
		setSaving(true);
		try {
			const saved = await requestJson<AppConfig>('/admin/api/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config),
			});
			setConfig(saved);
			setDirty(false);
			setToast('配置已保存');
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				setLoginError('登录已过期，请重新登录');
				setConfig(null);
				setDirty(false);
			} else {
				setToast(error instanceof Error ? error.message : '保存失败');
			}
		} finally {
			setSaving(false);
		}
	}

	async function logout() {
		await requestJson('/admin/api/logout', { method: 'POST' });
		setConfig(null);
		setDirty(false);
	}

	return (
		<main className="shell">
			<header className="topbar">
				<div className="wordmark"><strong>Ladder</strong><span>Configuration</span></div>
				<div className="top-actions">
					<span className="updated">{config.updatedAt ? `上次保存 ${new Date(config.updatedAt).toLocaleString()}` : '尚未保存到数据库'}</span>
					<button className="text-button" type="button" onClick={logout}>退出</button>
				</div>
			</header>
			<div className="layout">
				<nav className="nav" aria-label="配置分类">
					<p className="nav-label">配置</p>
					<button className={panel === 'providers' ? 'active' : ''} type="button" onClick={() => setPanel('providers')}>订阅管理</button>
					<button className={panel === 'nodes' ? 'active' : ''} type="button" onClick={() => setPanel('nodes')}>自建节点</button>
					<button className={panel === 'tailscale' ? 'active' : ''} type="button" onClick={() => setPanel('tailscale')}>Tailscale</button>
					<button className={panel === 'templates' ? 'active' : ''} type="button" onClick={() => setPanel('templates')}>模板配置</button>
				</nav>
				<section className="content">
					{panel === 'providers' && (
						<div>
							<h1>订阅管理</h1>
							<p className="lead">管理用于聚合节点的 Clash Provider。列表顺序即输出顺序。</p>
							<ProviderEditor providers={config.providers} onChange={(providers) => update({ providers })} />
						</div>
					)}
					{panel === 'nodes' && (
						<div>
							<h1 id="nodes-heading">自建节点</h1>
							<p className="lead">以 Clash YAML 格式维护自建节点。</p>
							<p className="hint">顶层必须包含 <code>proxies</code> 数组。</p>
							<textarea className="editor" aria-labelledby="nodes-heading" spellCheck={false} value={config.extraNodes} onChange={(event) => update({ extraNodes: event.target.value })} />
						</div>
					)}
					{panel === 'tailscale' && (
						<div>
							<h1>Tailscale</h1>
							<p className="lead">配置设备加入 Tailnet 时使用的默认 Auth key。</p>
							<TailscaleEditor
								authKey={config.tailscaleAuthKey}
								admiralAuthKey={config.tailscaleAdmiralAuthKey}
								onAuthKeyChange={(tailscaleAuthKey) => update({ tailscaleAuthKey })}
								onAdmiralAuthKeyChange={(tailscaleAdmiralAuthKey) => update({ tailscaleAdmiralAuthKey })}
							/>
						</div>
					)}
					{panel === 'templates' && (
						<div>
							<h1 id="templates-heading">模板配置</h1>
							<p className="lead">生成订阅时保留模板内容，并覆盖其中的节点列表。</p>
							<div className="template-tabs" role="tablist" aria-label="模板类型">
								<button className={template === 'clash' ? 'active' : ''} type="button" role="tab" aria-selected={template === 'clash'} onClick={() => setTemplate('clash')}>Clash YAML</button>
								<button className={template === 'singbox' ? 'active' : ''} type="button" role="tab" aria-selected={template === 'singbox'} onClick={() => setTemplate('singbox')}>sing-box JSON</button>
							</div>
							<Suspense fallback={<div className="code-editor-loading">正在加载编辑器…</div>}>
								{template === 'clash' ? (
									<CodeEditor
										ariaLabel="Clash YAML 模板"
										language="yaml"
										value={config.clashTemplate}
										onChange={(clashTemplate) => update({ clashTemplate })}
									/>
								) : (
									<CodeEditor
										ariaLabel="sing-box JSON 模板"
										language="json"
										value={config.singBoxTemplate}
										onChange={(singBoxTemplate) => update({ singBoxTemplate })}
									/>
								)}
							</Suspense>
						</div>
					)}
				</section>
			</div>
			<div className="savebar">
				<div className="savebar-inner">
					<span className="save-state">{saving ? '正在保存…' : dirty ? '有未保存的修改' : '配置已同步'}</span>
					<button className="primary" type="button" disabled={saving || !dirty} onClick={save}>保存全部配置</button>
				</div>
			</div>
			{toast && <div className="toast" role="status">{toast}</div>}
		</main>
	);
}
