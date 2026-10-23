---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

## Steps

1. Read the spec and find its associated implementation tickets to understand the task graph. If no tickets are defined, explain that this workflow requires them and ask whether the user wants whole-task implementation with [implement](../implement/SKILL.md) or ticket decomposition first. Wait for that choice before proceeding; create tickets only if the user chooses decomposition. An absent ticket graph is a missing prerequisite, not completed work.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Record the starting commit as the full-spec review base and create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;
   - follows the repository's development and validation guidance when building the ticket; where that guidance does not specify a development method, uses `tdd` as the fallback;
   - merges the integration branch tip into its own branch before reporting a candidate, recording the exact incorporated integration commit as the ticket review base;
   - remains available for improvements and review corrections until its work passes review;
   - implements each assigned iteration and returns without invoking this enclosing workflow.

5. When an implementer reports a candidate, start a **reviewer subagent** for that ticket. Before reviewing, read [the shared review-and-fix procedure](../../../docs/agents/review-loop.md). The reviewer coordinates that procedure with the existing implementer, using `code-review` against the ticket requirements and repository standards. Supply the recorded incorporated integration commit as base, the candidate commit, and the ticket/spec pointers. Only when both Standards and Spec have no unresolved findings may a **merger subagent** merge the approved candidate into the integration branch. Serialize integration updates. If the integration tip has advanced since the ticket was prepared, have the implementer integrate that tip, update the ticket review base to that exact integration commit, and send the resulting candidate through review with the existing finding record before merging. The merger must land the reviewed tree; any conflict resolution or other change goes back through review before landing.

6. Advance the dependency graph after each reviewed ticket lands. Launch implementers for the new ready **frontier** while other tickets continue implementation or review. A ticket awaiting review does not satisfy its dependents. Keep unrelated ready work running; review is a per-ticket gate, not a frontier-wide barrier.

7. Once all tickets have landed, delegate the **integration review loop** to a reviewer subagent and keep an implementer available for corrections. The reviewer coordinates the shared procedure using `code-review` against the full spec, from the recorded starting commit to the integration candidate. Preserve the independent Standards and Spec reviewers. Review every updated candidate after fixes until both axes have no unresolved findings. Keep iterative coordination in the reviewer subagent where possible. It returns the passing candidate and review record, or unresolved findings and the reason it is blocked or repeatedly stalled. A blocked loop leaves completion pending.

8. Confirm the integration tip is the passing candidate before marking a draft PR ready or resolving tickets through the issue tracker's completion mechanism. Report the integration branch and both review results. If the tip changed, return to step 7.

9. Clean up implementer worktrees after completion. Preserve unfinished work when a loop is blocked.

The integration loop is the required final review. When the originating session is available and appropriate, the user can additionally invoke [originator-review](../originator-review/SKILL.md) there, either around this delegated workflow or independently afterward. Its participation is optional; the integration reviewer does not become the originator.
