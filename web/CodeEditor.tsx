import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/yaml/register';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';
import singBoxSchema from './sing-box.schema.json';

self.MonacoEnvironment = {
	getWorker(_moduleId, label) {
		return label === 'json' ? new JsonWorker() : new EditorWorker();
	},
};

const singBoxModelUri = monaco.Uri.parse('inmemory://ladder/sing-box.json');

jsonDefaults.setDiagnosticsOptions({
	allowComments: false,
	enableSchemaRequest: false,
	schemas: [
		{
			fileMatch: [singBoxModelUri.toString()],
			schema: singBoxSchema,
			uri: 'https://sing-box.sagernet.org/schema.json',
		},
	],
	validate: true,
});

monaco.editor.defineTheme('ladder-light', {
	base: 'vs',
	inherit: true,
	rules: [],
	colors: {
		'editor.background': '#f7f7f7',
		'editor.foreground': '#111111',
		'editor.lineHighlightBackground': '#eeeeee',
		'editorLineNumber.foreground': '#a3a3a3',
		'editorLineNumber.activeForeground': '#111111',
		'editor.selectionBackground': '#d8d8d8',
		'editor.inactiveSelectionBackground': '#e8e8e8',
	},
});

interface Props {
	ariaLabel: string;
	language: 'json' | 'yaml';
	value: string;
	onChange: (value: string) => void;
}

export function CodeEditor({ ariaLabel, language, value, onChange }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	useEffect(() => {
		if (!containerRef.current) return;
		const uri = language === 'json' ? singBoxModelUri : monaco.Uri.parse('inmemory://ladder/clash-template.yaml');
		const model = monaco.editor.createModel(value, language, uri);
		const editor = monaco.editor.create(containerRef.current, {
			ariaLabel,
			automaticLayout: true,
			contextmenu: true,
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
			fontSize: 13,
			formatOnPaste: true,
			formatOnType: true,
			lineHeight: 22,
			minimap: { enabled: false },
			model,
			padding: { top: 16, bottom: 16 },
			quickSuggestions: { other: true, comments: false, strings: true },
			renderWhitespace: 'selection',
			scrollBeyondLastLine: false,
			smoothScrolling: true,
			tabSize: 2,
			theme: 'ladder-light',
			wordWrap: 'on',
		});
		const subscription = model.onDidChangeContent(() => onChangeRef.current(model.getValue()));
		editorRef.current = editor;

		return () => {
			subscription.dispose();
			editor.dispose();
			model.dispose();
			editorRef.current = null;
		};
	}, [ariaLabel, language]);

	useEffect(() => {
		const editor = editorRef.current;
		if (editor && editor.getValue() !== value) editor.setValue(value);
	}, [value]);

	return (
		<div className="code-editor-shell">
			<div className="code-editor" ref={containerRef} />
			<div className="code-editor-footer">
				<span>{language === 'json' ? 'JSON Schema · sing-box' : 'YAML · Clash'}</span>
				<span>Ctrl/⌘ + Space 补全 · Shift + Alt + F 格式化</span>
			</div>
		</div>
	);
}
