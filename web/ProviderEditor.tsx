import type { ProviderConfig } from './types';

interface Props {
	providers: ProviderConfig[];
	onChange: (providers: ProviderConfig[]) => void;
}

export function ProviderEditor({ providers, onChange }: Props) {
	return (
		<>
			{providers.length === 0 ? (
				<p className="empty">还没有订阅。添加一个名称和订阅地址即可开始。</p>
			) : (
				<div className="provider-list">
					<div className="provider-head" aria-hidden="true">
						<span />
						<span>状态</span>
						<span>名称</span>
						<span>订阅地址</span>
						<span />
					</div>
					{providers.map((provider, index) => (
						<div className={`provider${provider.enabled ? '' : ' disabled'}`} key={provider.id}>
							<span className="row-number">{String(index + 1).padStart(2, '0')}</span>
							<button
								className={`provider-toggle${provider.enabled ? ' active' : ''}`}
								type="button"
								role="switch"
								aria-checked={provider.enabled}
								onClick={() =>
									onChange(providers.map((item, itemIndex) => (itemIndex === index ? { ...item, enabled: !item.enabled } : item)))
								}
							>
								<span className="switch" aria-hidden="true"><span /></span>
								<span className="status-label">{provider.enabled ? '启用' : '停用'}</span>
							</button>
							<div className="provider-field">
								<label htmlFor={`provider-name-${provider.id}`}>名称</label>
								<input
									id={`provider-name-${provider.id}`}
									className="field"
									value={provider.name}
									onChange={(event) =>
										onChange(providers.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))
									}
								/>
							</div>
							<div className="provider-field">
								<label htmlFor={`provider-url-${provider.id}`}>订阅地址</label>
								<input
									id={`provider-url-${provider.id}`}
									className="field"
									type="url"
									value={provider.url}
									onChange={(event) =>
										onChange(providers.map((item, itemIndex) => (itemIndex === index ? { ...item, url: event.target.value } : item)))
									}
								/>
							</div>
							<button
								className="remove-button"
								type="button"
								aria-label={`删除 ${provider.name || '订阅'}`}
								onClick={() => onChange(providers.filter((_, itemIndex) => itemIndex !== index))}
							>
								删除
							</button>
						</div>
					))}
				</div>
			)}
			<button
				className="secondary"
				type="button"
				onClick={() => onChange([...providers, { id: crypto.randomUUID(), name: '', url: '', enabled: true }])}
			>
				添加订阅
			</button>
		</>
	);
}
