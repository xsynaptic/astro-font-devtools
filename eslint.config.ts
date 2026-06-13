import { getConfig, getWebComponentConfig } from '@xsynaptic/eslint-config';
import tseslint from 'typescript-eslint';

export default getConfig([
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'playground/**'],
	},
	{
		files: ['**/*.config.{ts,mts,mjs,js}', '**/tests/**'],
		...tseslint.configs.disableTypeChecked,
	},
	{
		// Conflicts with Prettier on multiline html`` templates; Prettier owns that formatting
		rules: {
			'unicorn/template-indent': 'off',
		},
	},
	getWebComponentConfig(['**/src/client/**/*.ts']),
]);
