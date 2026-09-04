import { useState } from 'react';

interface Props {
	authKey: string;
	admiralAuthKey: string;
	onAuthKeyChange: (value: string) => void;
	onAdmiralAuthKeyChange: (value: string) => void;
}

export function TailscaleEditor({ authKey, admiralAuthKey, onAuthKeyChange, onAdmiralAuthKeyChange }: Props) {
	const [authKeyVisible, setAuthKeyVisible] = useState(false);
	const [admiralKeyVisible, setAdmiralKeyVisible] = useState(false);

	return (
		<div className="secret-fields">
			<div className="secret-field">
				<label htmlFor="tailscale-auth-key">默认 Auth key</label>
				<div className="secret-input">
					<input id="tailscale-auth-key" className="field" type={authKeyVisible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={authKey} onChange={(event) => onAuthKeyChange(event.target.value)} />
					<button className="text-button reveal-button" type="button" aria-pressed={authKeyVisible} onClick={() => setAuthKeyVisible((current) => !current)}>
						{authKeyVisible ? '隐藏' : '显示'}
					</button>
				</div>
				<p className="field-help">用于 macOS、iPhone、iPad 等普通设备配置。</p>
			</div>
			<div className="secret-field">
				<label htmlFor="tailscale-admiral-auth-key">Admiral Auth key</label>
				<div className="secret-input">
					<input id="tailscale-admiral-auth-key" className="field" type={admiralKeyVisible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={admiralAuthKey} onChange={(event) => onAdmiralAuthKeyChange(event.target.value)} />
					<button className="text-button reveal-button" type="button" aria-pressed={admiralKeyVisible} onClick={() => setAdmiralKeyVisible((current) => !current)}>
						{admiralKeyVisible ? '隐藏' : '显示'}
					</button>
				</div>
				<p className="field-help">仅用于 <code>/sing-box/admiralxs/*</code> 设备配置。</p>
			</div>
		</div>
	);
}
