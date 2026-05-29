import { defineConfig } from '@eslint/config-helpers';
import eslint from '@eslint/js';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
	{
		ignores: ['**/node_modules/**', '**/dist/**', '*.config.{mjs,ts}'],
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
			'@typescript-eslint': tseslint.plugin,
		},
	},
	{
		files: ['**/*.ts', '**/*.mts', '**/*.cts'],
		rules: {
			'@typescript-eslint/array-type': ['warn', { default: 'generic' }],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ fixStyle: 'separate-type-imports', prefer: 'type-imports' },
			],
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			'unicorn/prevent-abbreviations': 'off',
		},
	},
	// These files run in the browser
	{
		files: ['src/toolbar.ts', 'src/combobox.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
);
