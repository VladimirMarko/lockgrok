---
name: originator-review
description: Review an implementation in the originating session against retained task intent and the written spec, including when invoked independently after implementation.
---

The originator is an agent that established or substantively refined the task's
requirements with the user and retains the relevant agreement. This can be a
later session that refined an existing issue; merely making the latest edit
does not qualify. This is provenance, not a role another reviewer acquires.
Review intent directly in this session,
without subagents or another Standards review. Ordinary `code-review` loops
provide the Standards and Spec checks; this review is optional.

1. Establish which relevant discussion survives in the session and which issue
   version recorded the agreement. Read the current written spec using the
   repository's tracker guidance and compare it with that version. Authorship
   alone does not establish retained context after compaction. If the discussion
   or original issue version cannot be established, report that limitation and
   review against the available spec. Manual invocation works without discovering
   or contacting any other session.
2. Pin the candidate commit and inspect its implementation and ordinary review
   results. Use retained intent as an acceptance criterion when the relevant
   context survives and the issue is unchanged. Reconcile changed requirements
   or obsolete codebase assumptions before applying remembered intent. Ask the
   user when missing or conflicting decisions affect acceptance; keep acceptance
   pending on those decisions.
3. Report findings with evidence from the candidate. Label findings grounded in
   retained discussion as such, separately from written-spec findings. Record
   their status across subsequent reviews.
4. Route required changes to an implementer and an ordinary reviewer using
   [the shared review procedure](../../../docs/agents/review-loop.md). For
   `implement-spec`, the implementer handles corrections and the ticket and
   integration reviewers rerun the applicable loops. For a whole-task workflow,
   assign an implementer for corrections and a reviewer to coordinate its single
   implementation-and-review loop. When invoked independently, establish these
   assignments with the available workflow; no originating-session discovery is
   required. These agents handle implementation and ordinary review only; keep
   the originator's intent review here.
5. After corrections pass the applicable `code-review` loops, directly review
   intent again on the resulting candidate. Repeat while required findings
   remain, retaining prior findings until verified fixed or explicitly resolved
   with a reason. If blocked, report the candidate, unresolved findings, and
   needed decision. Acceptance names the exact reviewed candidate and context
   limitations; later changes require review again.
