import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	{ ignores: ['.next/**', 'node_modules/**', 'coverage/**', '**/._*', 'next-env.d.ts'] },
	...compat.extends('next/core-web-vitals', 'next/typescript'),
	{ rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
	{ files: ['jest.config.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];

export default eslintConfig;
