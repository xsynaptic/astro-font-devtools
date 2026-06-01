import { defineConfig } from '@eslint/config-helpers';
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import { configs as wcConfigs } from 'eslint-plugin-wc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
	{
		ignores: ['**/node_modules/**', '**/dist/**', 'playground/**'],
	},
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	unicorn.configs.recommended,
	perfectionist.configs['recommended-natural'],
	{
		languageOptions: {
			ecmaVersion: 'latest',
			globals: {
				...globals.node,
				...globals.es2022,
			},
			parser: tseslint.parser,
			parserOptions: {
				projectService: true,
			},
			sourceType: 'module',
		},
		plugins: {
			'@stylistic': stylistic,
			'@typescript-eslint': tseslint.plugin,
		},
	},
	{
		files: ['**/*.ts', '**/*.mts', '**/*.cts'],
		rules: {
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', next: 'return', prev: '*' },
				{ blankLine: 'always', next: '*', prev: 'block-like' },
			],
			'@typescript-eslint/array-type': ['error', { default: 'generic' }],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ fixStyle: 'separate-type-imports', prefer: 'type-imports' },
			],
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'unicorn/prevent-abbreviations': 'off',
			// Incompatible with Prettier handling template literal formatting
			'unicorn/template-indent': 'off',
		},
	},
	// Native web components (client/ custom elements)
	{
		...wcConfigs['flat/best-practice'],
		files: ['src/client/**/*.ts'],
		rules: {
			...wcConfigs['flat/best-practice'].rules,
			'wc/define-tag-after-class-definition': 'error',
			'wc/guard-define-call': 'error',
			'wc/max-elements-per-file': 'error',
			// Elements render their own light DOM via innerHTML and query it in the same synchronous
			// callback; the parser-timing race this rule guards against cannot occur for self-written markup
			'wc/no-child-traversal-in-connectedcallback': 'off',
			'wc/no-constructor': 'error',
			'wc/no-exports-with-element': 'error',
			'wc/no-method-prefixed-with-on': 'error',
		},
	},
);
