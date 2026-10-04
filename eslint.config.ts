import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  // `svelte/` is the SvelteKit rewrite: its own package, linted by its own config.
  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'svelte/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,

  // Honor the `_` prefix convention for intentionally-unused args / destructured
  // values. Common in mock/stub functions (test doubles) and callback signatures
  // where we don't control the arity.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // shadcn-vue UI components use single-word names and vendored code with any types
  {
    files: ['src/components/ui/**/*.{vue,ts}'],
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Supabase edge functions run in Deno with different conventions
  {
    files: ['supabase/functions/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
