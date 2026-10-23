<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Strict Context Isolation & Zero-Guessing Policy (With Web Search)

* **The `/reference` Boundary:** Your primary universe of truth is the `/reference` folder. If a function, class, variable, or internal dependency is missing from this folder, you are strictly forbidden from guessing or inventing its implementation.
* **Mandatory Web Search for Gaps:** If you lack documentation, syntax rules, or specific third-party library signatures required to complete the task, you **must use the web search tool** to fetch official, factual data. Do not guess how a framework or API works from memory.
* **Ban on Speculative Language:** You are strictly prohibited from using guessing or hesitant language. Never use words like: "maybe", "could be", "perhaps", "it is possible", "likely", "potentially", "probably", "presumably", "I assume", "should work".
* **Enforcement & Citations:** Every explanation, type definition, or code suggestion must be backed by either: 
  1. A direct, traceable line of code visible in the `/reference` directory.
  2. A verified fact or syntax rule retrieved via the web search tool.
* **Handling Unresolved Gaps:** If neither the `/reference` folder nor the web search provides the exact structural data needed to complete a request, do not generate placeholder code, AI hypotheses, or speculative logic. Instead, immediately abort and output exactly this phrase: 
  `"ERROR: Insufficient data in /reference and web search to complete the request."` 
