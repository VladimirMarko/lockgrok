---
name: no-ai-slop
description: "Rules and worked examples for writing prose that does not read like AI-generated slop. Consult before writing or editing any prose."
---

# No AI Slop

This package contains the complete adjusted writing rules and supporting
[examples and lexical catalogs](references/ai-writing-detection.md). Read that
reference during self-check. Project-specific additions may live in separately
identified guidance; neither root AGENTS.md nor CLAUDE.md needs to hold these rules.

The migration identifiers below follow [upstream rules 1–24](https://github.com/realrossmanngroup/no_ai_slop_writing_rules/blob/35e32ae45878148a6bd898572a9d15c96711affe/CLAUDE.md),
reconciled for this repository in issue #28. These are editorial rules, not a
detector or proof of AI authorship. Apply them to authored prose while preserving
verbatim quotations, titles, names, code, identifiers, and precise technical usage.
The WRONG/RIGHT pairs are editing illustrations, not independently verified
sources for the factual claims they contain; verify those claims before reuse.

## Rule 1: Punctuation

Use a period, comma, semicolon, parentheses, or a rewritten sentence instead of em dashes in authored prose. Preserve verbatim source text and code.

- WRONG: "The policy -- which affected millions -- was later reversed."
- RIGHT: "The policy affected millions of devices. The company reversed it in December 2017."

## Rule 2: Evidence for quantities

Ground factual quantities in traceable sources or reproducible calculations. Clearly label hypothetical or example values; an external citation is not required for every numeral.

## Rule 4: Intensifiers

Replace empty emphasis with evidence or cut it. Consult the bundled intensifier catalog rather than treating every occurrence as filler. Preserve technical meanings, including a stated statistical significance result.

- WRONG: "The pricing was significantly higher than the cost of the part."
- RIGHT: "They charged $1,200 for a repair that needed a $5 chip."

## Rule 5: Concrete claims

Replace hollow assertions of importance with concrete, supported claims. A fact need not fall at the literal end of every sentence.

- WRONG: "This practice has had a significant impact on people."
- RIGHT: "The company replaced 11 million batteries in 2018, against the 1 to 2 million it had expected."

## Rule 6: Repeated points

Remove duplicated talking points. Retain a requested summary or a necessary cross-reference.

## Rule 7: Section and paragraph structure

Vary sections and paragraphs when repeated shapes add nothing. Retain parallel structure for parallel facts, procedures, and comparisons.

- WRONG (three sections, identical shape):
  ```
  In [year], [party] did [thing]. This affected [number] people. [Party] responded by [action].
  In [year], [party] did [thing]. This affected [number] people. [Party] responded by [action].
  In [year], [party] did [thing]. This affected [number] people. [Party] responded by [action].
  ```
- RIGHT (vary the shape):
  ```
  Section one: a detailed narrative with timeline and context across two paragraphs.
  Section two: a two-sentence summary, because the event is thinly documented.
  Section three: opens with the party's stated justification, then the contradicting evidence.
  ```

## Rule 8: Direct references

Replace empty narration such as “as we will see” with the connection itself. Keep useful navigational links and document pointers.

## Rule 9: Supported urgency

Support urgency with a concrete deadline or consequence; otherwise remove the demand to act now.

## Rule 10: Quotation marks

Avoid scare quotes used to insinuate doubt. Keep quotation marks for actual quotations, literal strings, terms under discussion, and technical syntax.

## Rule 11: Filler phrases

Open on the subject or fact. Remove stock preambles and empty endings; use the bundled phrase catalog during self-check.

- WRONG: "In today's world, planned obsolescence affects many devices."
- RIGHT: "Apple, Samsung, and Google have each faced lawsuits alleging planned obsolescence."

## Rule 12: Audience-list openings

Avoid the stock “Whether you’re…” audience-list opening. State who the guidance serves directly. Preserve exact quotations and literal examples.

## Rule 13: Research-style specificity

If a sentence could sit on any advocacy or marketing site unchanged, it is generic. Anchor it to something checkable.

- WRONG: "People deserve the right to repair their own devices."
- RIGHT: "The FTC voted 5-0 in July 2021 to step up enforcement against illegal repair restrictions."

## Rule 14: Enthusiasm

Avoid gratuitous exclamation marks and cheerleading. Preserve quotations, code punctuation, and a user-requested voice.

## Rule 15: Meaningful uncertainty

Remove stacked or empty hedges. State real uncertainty and its basis; never turn uncertain evidence into a categorical claim to satisfy style.

- WRONG: "Serialization may potentially prevent independent repair."
- RIGHT: "Replacing an iPhone 15 camera module without the manufacturer's calibration software disables optical image stabilization."

## Rule 16: Descriptive headings

Name the actual subject and content. Replace dramatic or vague abstract headings such as “Broader implications.” See the bundled heading examples.

### Rule 3: Heading clarifications

Rewrite unnecessary parenthetical asides into a direct heading. Retain necessary technical disambiguation.

- WRONG: "The Hidden Cost of Planned Obsolescence"
- RIGHT: "Economic impact of shortened product lifespans"

## Rule 17: Incidents and examples

Do not present invented incidents as real. Use documented events, or explicitly label hypotheticals, worked examples, and test fixtures.

## Rule 18: History and dates

Ground dates, events, and milestones in evidence. Label estimates and unknown dates honestly.

## Rule 19: Traceable attribution

Trace attributed quotations and positions of people, organizations, and companies to supporting documents, transcripts, statements, or reports. Party, role, and reputation do not establish a position.

- WRONG: "Senator Smith has argued that the right to repair is essential."
- RIGHT: "Senator Smith co-sponsored the Fair Repair Act in January 2024."

## Rule 20: Plain transitions

Use plain connections such as “also,” “and,” “but,” “however,” or “still,” or omit a transition. Consult the bundled catalog for stock transitions.

## Rule 21: Plain verbs

Use precise, familiar verbs in place of inflated ones. Consult the bundled verb catalog; preserve literal or technical meanings, identifiers, titles, and quotations.

## Rule 22: Academic filler

Cut academic padding using the bundled examples. Preserve legitimate mathematical terminology, including “derivative with respect to x.”

## Rule 23: Quotation fidelity

Match quoted wording exactly. Mark changes with brackets and omissions transparently without changing the meaning. Otherwise paraphrase without quotation marks. Identify the source and speaker where appropriate. Use block quotes when length or readability warrants; roughly fifteen words is guidance, not a universal threshold. Respect applicable quotation limits.

## Rule 24: Research-process narration

Remove unnecessary search diaries from finished prose. Preserve requested methods, relevant negative findings, missing evidence affecting a conclusion, tool or test failures, blockers, and progress reports. Style must not conceal a limitation.

## Root-cause differentiation

When you contrast two things, name the concrete difference that separates them. Do not assert that one is exempt, newer, better, or unaffected without saying what specifically makes it so.

- WRONG: "2020+ Leaf models are unaffected and use the MyNISSAN app instead."
- RIGHT: "2020+ Leaf models shipped with 4G/LTE telematics units connected to a newer cloud platform, replacing the 2G/3G units in earlier models. Those vehicles use the MyNISSAN app, which talks to a different backend."

Whenever you say A differs from B, name the part, the version, the date, the mechanism, or the supply-chain change that makes the difference real. If you do not have that detail, do not imply the difference exists.

## Worked cases for exceptions

These are hypothetical editing examples, not reports of real events.

- **Uncertainty:** Replace “The cache definitely caused the failure” with “The failure occurred only with the cache enabled; the logs do not establish the cause.” Keep the evidence limitation.
- **Incident:** Replace an unsupported “A customer lost 20 files” with “Hypothetical example: a failed write loses 20 files.” Do not relabel a real unknown incident as fact.
- **Mathematics:** Keep “Differentiate f with respect to x.” Replacing the technical phrase with “about x” changes its meaning.
- **Quotation:** Given the fixture source `We may—after testing—ship.`, quote it exactly as “We may—after testing—ship.” A paraphrase is: The fixture speaker says shipment depends on testing. Do not silently remove the qualification or punctuation inside the quote.
- **Validation failure:** Keep “The validation command failed because the dependency was unavailable; the build remains unverified.” Removing it would hide a material limitation.

## Self-check before returning text

1. Read the bundled reference. Review lexical matches in context, respecting quotation, code, and technical exclusions.
2. Check factual quantities, dates, incidents, and attributions against evidence or calculations. Label examples and estimates.
3. Verify quotation fidelity and transparent changes or omissions.
4. Replace filler and hollow claims with supported content. Check headings for a specific subject and necessary disambiguation.
5. Remove duplicated points and unhelpful structural repetition; retain useful parallelism and requested summaries.
6. State uncertainty with its basis. Keep relevant missing evidence, validation failures, and blockers.
7. Read aloud for clarity. Assess meaning, not word counts or purported AI-detection thresholds.
