const js = require('@eslint/js')
const globals = require('globals')
const nodePlugin = require('eslint-plugin-n')

module.exports = [
	{
		ignores: ['node_modules/**'],
	},
	{
		files: ['eslint.config.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			globals: globals.node,
			sourceType: 'commonjs',
		},
		rules: js.configs.recommended.rules,
	},
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			globals: globals.node,
			sourceType: 'commonjs',
		},
		plugins: {
			n: nodePlugin,
		},
		rules: {
			...js.configs.recommended.rules,
			'n/no-missing-require': 'error',
			'preserve-caught-error': 'off',
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
		},
	},
]
