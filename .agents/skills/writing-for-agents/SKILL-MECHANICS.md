# Skill mechanics

The skill-specific branch of [`writing-for-agents`](SKILL.md): what changes when the document is a skill (frontmatter, the invocation choice, and router skills). Everything else about writing it is the universal reference in `SKILL.md`.

## Invocation

Two choices, trading the two loads:

- A **model-invoked** skill allows automatic discovery through its `description` and remains explicitly invocable by the user. Write a model-facing description carrying the trigger branches (the pointer-writing rules in `SKILL.md` apply in full). Its description spends context load in exchange for discoverability.
- A **user-invoked** skill requires explicit invocation rather than automatic selection. Write a human-facing description: a one-line summary, trigger lists stripped. Its description is excluded from default discovery context, so the human carries the cognitive load of knowing when to invoke it.

Maintain invocation policy for both supported platforms:

| Policy | Claude Code: `SKILL.md` frontmatter | Codex: `agents/openai.yaml` |
| --- | --- | --- |
| Model-invoked | Omit `disable-model-invocation` or set it to `false` | Omit `policy.allow_implicit_invocation` or set it to `true` |
| User-invoked | Set `disable-model-invocation: true` | Set `policy.allow_implicit_invocation: false` |

Keep both settings aligned for cross-platform skills. The Claude field is not
a substitute for the Codex policy. Users invoke skills with `/skill-name` in
Claude Code and `$skill-name` in Codex. These settings control invocation;
they do not make referenced files inaccessible to an agent.

Sources: [Claude Code invocation controls](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill)
and [Codex skill configuration](https://learn.chatgpt.com/docs/build-skills).
When a validator rejects the Claude field, distinguish a validator schema
limitation from an invalid Claude setting. Preserve cross-platform policy
and report the validation limitation rather than deleting the field to pass.

Pick model-invocation only when the agent must reach the skill on its own, or another skill must. If it only ever fires by hand, make it user-invoked and pay no context load.

Put reference shared by user-invoked skills in a plain file that each can
read directly, so sharing instructions does not depend on invoking another
workflow.

## Using a skill from another skill

Use and follow the named skill through the current host's supported mechanism.
When a dedicated invocation tool is available, use it as supported (including
Claude Code's Skill tool). Otherwise, read the identified `SKILL.md` and its
required references with available file or resource tools, then follow them.
Resolve repository skill links relative to the referring file; for installed
skills use the host's catalog paths or resource identifiers. Report an unavailable
required skill rather than pretending it ran.

Preserve the target's invocation policy and permission requirements. A pointer
or a shared-reference read does not authorize a user-only workflow. Recommend
explicit invocation when required. Reading vocabulary or a procedure as a
reference does not launch its enclosing workflow.

For workflow-level repository guidance lookup, prefer applicable `AGENTS.md`;
use `CLAUDE.md` as a conditional fallback where appropriate and present. This
lookup is not a claim about automatic instruction discovery. When both exist,
respect the host's instruction precedence and applicable scope; do not override
already loaded instructions based on this filename preference. Keep root
instruction files short and point to skill packages or optional project rules.
Do not silently change global agent configuration or fallback filenames.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`): split off a model-invoked skill when you have a distinct leading word that should trigger it on its own (a trigger word you actually use in your prompts), or another skill must reach it. You pay context load for the new always-loaded description, so that independent reach has to be worth it.

## Router skills

When user-invoked skills multiply past what you can remember, use a **router
skill** that names the others and when to reach for each. The human then has
one entry point to remember. A router should recommend the appropriate
explicit invocation; linking a skill does not override its invocation policy.
