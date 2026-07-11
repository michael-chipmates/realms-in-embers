// Lint, scoped to the failure classes the audits actually named:
// floating promises (async work silently dropped), loose equality, and
// non-exhaustive switches over engine unions. Style stays a human matter.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', {
        considerDefaultExhaustiveForUnions: true,
      }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
);
