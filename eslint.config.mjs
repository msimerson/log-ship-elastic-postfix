import globals from 'globals';
import js from '@eslint/js';

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['coverage/**', 'node_modules/**'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      ecmaVersion: 2020,
    },
    rules: {
      ...js.configs.recommended.rules,
      'brace-style': [
        'error',
        'stroustrup',
        {
          allowSingleLine: true,
        },
      ],

      curly: ['warn', 'multi-line'],
      'dot-notation': 'error',
      eqeqeq: 'error',

      indent: [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],

      'no-console': 'off',
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
      'no-multiple-empty-lines': 'error',
      'no-throw-literal': 'error',
      'no-trailing-spaces': [
        'error',
        {
          skipBlankLines: false,
        },
      ],
      'no-underscore-dangle': 'off',
      'no-use-before-define': [
        'error',
        {
          functions: false,
        },
      ],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],

      'object-curly-spacing': ['error', 'always'],
      'quote-props': ['error', 'as-needed'],
      quotes: ['warn', 'single'],
      radix: 'error',

      'semi-spacing': 'error',
      'space-in-parens': ['error', 'never'],
      'space-unary-ops': [
        'error',
        {
          words: true,
          nonwords: false,
        },
      ],

      'keyword-spacing': [
        'error',
        {
          before: true,
          after: true,
        },
      ],

      'wrap-iife': ['error', 'inside'],
    },
  },
];
