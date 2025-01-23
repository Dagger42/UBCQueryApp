const path = require("path");

module.exports = {
	ignorePatterns: [".eslintrc.js", "frontend/**/*"],
	env: {
		browser: true,
		es6: true,
		node: true
	},
	// noInlineConfig: true, // disallows using /* eslint-disable */ comments
	parser: "@typescript-eslint/parser",
	parserOptions: {
		project: path.join(__dirname, "tsconfig.json"),
		sourceType: "module",
	},
	plugins: ["@ubccpsc310/descriptive"],
	extends: [
		// disables any rules that conflict with `prettier`
		"prettier",
	],
	overrides: [
		{
			files: ["**/*.spec.ts"],
			rules: {
				"@ubccpsc310/descriptive/max-lines": "off",
				"max-lines": "off",
				// `describe` functions exceed this limit easily
				"@ubccpsc310/descriptive/max-lines-per-function": "off",
				"max-lines-per-function": "off",
				// `describe`/`it` have 3 additional callbacks (if they want to have two nested describes)
				"@ubccpsc310/descriptive/max-nested-callbacks": ["error", 3 + 2],
				"max-nested-callbacks": ["error", 3 + 2],
			},
		},
	],
	rules: {
		// safety rules
		"@ubccpsc310/descriptive/ban-tslint-comment": "error",
		"@ubccpsc310/descriptive/no-eval": "error",

		// normal rules
		"@ubccpsc310/descriptive/await-thenable": "error",
		"@ubccpsc310/descriptive/consistent-generic-constructors": "error",
		"@ubccpsc310/descriptive/dot-notation": "error",
		"@ubccpsc310/descriptive/eqeqeq": "error",
		"@ubccpsc310/descriptive/explicit-function-return-type": "error",
		"@ubccpsc310/descriptive/explicit-member-accessibility": [
			"error",
			{
				overrides: {
					constructors: "off",
				},
			},
		],
		"@ubccpsc310/descriptive/max-len": [
			"error",
			{
				code: 120,
				ignoreComments: true,
				ignoreUrls: true,
				ignoreStrings: true,
			},
		],
		"@ubccpsc310/descriptive/max-lines": [
			"error",
			{
				max: 300,
				skipComments: true,
				skipBlankLines: true,
			},
		],
		"@ubccpsc310/descriptive/max-lines-per-function": [
			"error",
			{
				max: 35,
				skipComments: true,
				skipBlankLines: true,
			},
		],
		"@ubccpsc310/descriptive/max-nested-callbacks": ["error", 2],
		"@ubccpsc310/descriptive/naming-convention": [
			"error",
			{
				selector: "typeLike",
				format: ["PascalCase"],
			},
			{
				selector: "variable",
				format: ["camelCase", "PascalCase", "UPPER_CASE"],
			},
		],
		"@ubccpsc310/descriptive/no-async-promise-executor": "error",
		"@ubccpsc310/descriptive/no-await-in-loop": "error",
		"@ubccpsc310/descriptive/no-console": "warn",
		"@ubccpsc310/descriptive/no-floating-promises": [
			"error",
			{
				ignoreIIFE: true,
			},
		],
		"@ubccpsc310/descriptive/no-magic-numbers": [
			"error",
			{
				ignoreClassFieldInitialValues: true,
				ignoreDefaultValues: true,
				ignore: [-2, -1, 0, 1, 2, 10, 100],
				ignoreArrayIndexes: true,
			},
		],
		"@ubccpsc310/descriptive/no-misused-promises": [
			"error",
			{
				checksConditionals: true,
				checksVoidReturn: false,
			},
		],
		"@ubccpsc310/descriptive/no-shadow": "error",
		"@ubccpsc310/descriptive/no-unused-vars": [
			"error",
			{
				args: "none",
				argsIgnorePattern: "^_",
				caughtErrors: "all",
				caughtErrorsIgnorePattern: "^_",
				destructuredArrayIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				ignoreRestSiblings: true,
			},
		],
		"@ubccpsc310/descriptive/no-var": "error",
		"@ubccpsc310/descriptive/prefer-const": "error",
		"@ubccpsc310/descriptive/prefer-for-of": "error",
		"@ubccpsc310/descriptive/prefer-optional-chain": "error",
		"@ubccpsc310/descriptive/promise-function-async": "error",
	},
};
