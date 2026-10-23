---
name: implement
description: "Implement a conversation task or written spec in the current checkout, with independent review and repeated fixes until both review axes pass."
disable-model-invocation: true
---

Use `implement` for a whole task that fits one implementation-and-review loop.
Work in the current checkout and branch by default. The main agent implements;
a reviewer subagent coordinates review and requests corrections from it.

Use [implement-spec](../implement-spec/SKILL.md) when the work calls for a ticket
graph, parallel implementers, and an integration branch. This lightweight
workflow replaces that workflow's ticket, scheduling, and integration loops
with one loop against the full task. It requires no tickets, extra branches,
worktrees, merger agent, or separate final review.

## Establish scope and baseline

1. Establish the outcome and acceptance criteria from the conversation or
   supplied document. For a ticket reference, read the repository's tracker
   guidance, fetch the ticket, and state its title. Save the full requirements
   and relevant clarifications outside the source diff, accessible to the
   reviewer. Record their source and version; conversation requirements need
   no issue reference. Resolve ambiguity that affects acceptance with the user.
2. Read [the shared review-and-fix procedure](../../../docs/agents/review-loop.md),
   which defines the loop requirements shared with `implement-spec` from #3.
   Use its review record and snapshot rules throughout this workflow.
3. Before editing, record `HEAD`, index and working-tree changes, and relevant
   untracked files. Distinguish existing task work from unrelated user work,
   including when they share a file. Preserve the user's index and files.
   Capture a stable starting-state commit as the review base. Normally it
   represents the checkout before implementation, including unrelated edits.
   If task changes already exist, construct the base snapshot with those task
   changes removed only in the temporary snapshot, so review includes them.
   Record inclusions and exclusions; ask when ownership cannot be established.
   A supplied earlier baseline must likewise cover all task changes while
   excluding unrelated edits. Keep this base fixed through corrections.

## Implement and review

Implement the full task using the repository's development and validation
conventions. Apply the relevant skills, including example-driven development
for Lean claims and TDD when executable behavior needs runtime tests. Record
validation results and any limitations for the reviewer.

When implementation is ready, use the shared procedure's current-checkout
capture rules. Keep unrelated content at its baseline version in the snapshot;
preserve its live contents.

Start a reviewer subagent and give it the base and candidate SHAs, saved full
requirements, repository standards pointers, validation results, and review
record. Instruct it to use [code-review](../code-review/SKILL.md) with that
explicit spec and candidate, retaining its separate Standards and Spec
subagents. It coordinates the shared procedure and returns unresolved findings
to the main agent for correction. The main agent implements each correction
and supplies a new candidate and validation evidence; it does not recursively
invoke this workflow. Reuse the reviewer and finding record across rounds.

Apply the shared procedure's passing criteria and blocked outcome to this
whole-task loop.

## Finish

Apply the shared procedure's final candidate verification to the task changes
in the checkout, accounting for recorded unrelated exclusions.
Report the changes, validation results,
reviewed SHAs, and both review outcomes. Follow the user's instructions for
commits or publication; this workflow does not require either.

[Originator review](../originator-review/SKILL.md) is optional and can be invoked
manually in the originating session, including after this workflow completes.
Route its required changes through this same implementation-and-review loop
before originator re-review. Originator participation is not a completion gate.
