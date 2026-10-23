# Writing examples and lexical catalogs

Use these catalogs with [the complete rules](../SKILL.md). They are editing
prompts, not evidence of authorship or automatic replacement instructions.
The upstream reference included unsupported detector statistics and model
fingerprints; those are not retained as writing requirements.

## Exclusions and meaning

Preserve exact quotations, titles, names, code, configuration, markup examples,
identifiers, and literal values. Preserve precise technical meanings, such as
statistical significance, optimizing a mathematical objective, or differentiating
with respect to x. A match alone does not justify an edit. Nearby names or dates
do not by themselves make filler precise.

In authored prose, replace em dashes with commas, parentheses, a colon, a
semicolon, or separate sentences. Never apply this rewrite inside verbatim text.

## Overused Verbs

| Avoid | Use Instead |
|-------|-------------|
| delve (into) | explore, examine, investigate, look at |
| leverage | use, apply, draw on |
| optimise | improve, refine, enhance |
| utilise | use |
| facilitate | help, enable, support |
| foster | encourage, support, develop, nurture |
| bolster | strengthen, support, reinforce |
| underscore | emphasise, highlight, stress |
| unveil | reveal, show, introduce, present |
| navigate | manage, handle, work through |
| streamline | simplify, make more efficient |
| enhance | improve, strengthen |
| endeavour | try, attempt, effort |
| ascertain | find out, determine, establish |
| elucidate | explain, clarify, make clear |

---

## Overused Adjectives

| Avoid | Use Instead |
|-------|-------------|
| robust | strong, reliable, thorough, solid |
| comprehensive | complete, thorough, full, detailed |
| pivotal | key, critical, central, important |
| crucial | important, key, essential, critical |
| vital | important, essential, necessary |
| transformative | significant, important, major |
| cutting-edge | new, advanced, recent, modern |
| groundbreaking | new, original, significant |
| innovative | new, original, creative |
| seamless | smooth, easy, effortless |
| intricate | complex, detailed, complicated |
| nuanced | subtle, complex, detailed |
| multifaceted | complex, varied, diverse |
| holistic | complete, whole, comprehensive |

### Overused metaphorical nouns
These metaphors can add empty emphasis. Literal uses are fine.

| Avoid (metaphorical) | Acceptable (literal) |
|-------|-------------|
| tapestry ("a tapestry of regulations") | tapestry (actual woven fabric) |
| symphony ("a symphony of features") | symphony (actual musical composition) |
| beacon ("a beacon of hope") | beacon (actual light or signal device) |
| realm ("in the realm of cybersecurity") | realm (actual kingdom or territory) |
| testament ("a testament to innovation") | testament (actual legal document, e.g., last will and testament) |

---

## Overused Transitions and Connectors

| Avoid | Use Instead |
|-------|-------------|
| furthermore | also, in addition, and |
| moreover | also, and, besides |
| notwithstanding | despite, even so, still |
| that being said | however, but, still |
| at its core | essentially, fundamentally, basically |
| to put it simply | in short, simply put |
| it is worth noting that | note that, importantly |
| in the realm of | in, within, regarding |
| in the landscape of | in, within |
| in today's [anything] | currently, now, today |

---

## Stock phrases

### Opening Phrases to Avoid
- "In today's fast-paced world..."
- "In today's digital age..."
- "In an era of..."
- "In the ever-evolving landscape of..."
- "In the realm of..."
- "It's important to note that..."
- "Let's delve into..."
- "Imagine a world where..."
- "When it comes to..."
- "It goes without saying..."
- "This is where X comes in..."
- "Look no further..."
- "Our team of experts..."

### Transitional Phrases to Avoid
- "That being said..."
- "With that in mind..."
- "It's worth mentioning that..."
- "At its core..."
- "To put it simply..."
- "In essence..."
- "This begs the question..."

### Concluding Phrases to Avoid
- "In conclusion..."
- "To sum up..."
- "By [doing X], you can [achieve Y]..."
- "In the final analysis..."
- "All things considered..."
- "At the end of the day..."

### Structural Patterns to Avoid
- "Whether you're a [X], [Y], or [Z]..." (listing three examples after "whether")
- "It's not just [X], it's also [Y]..."
- "Think of [X] as [elaborate metaphor]..."
- Starting sentences with "By" followed by a gerund: "By understanding X, you can Y..."
- Contrasting parallelisms: "It's not X. It's Y." or "It's not about X, it's about Y." Keep a contrast only when it explains a concrete difference.

### Inflated symbolism phrases
Replace empty symbolism with the actual event or mechanism:
- "provide a valuable insight"
- "left an indelible mark"
- "play a significant role in shaping"
- "an unwavering commitment"
- "open a new avenue"
- "a stark reminder"
- "gain a comprehensive understanding"
- "serves as a testament"
- "watershed moment"
- "deeply rooted"

---

## Heading Anti-Patterns

Headings should name their content. Replace unnecessary parenthetical asides, dramatic framing, and vague labels such as “Broader implications”; retain technical disambiguation.

### Heading examples

| Pattern | Bad Example | Good Replacement |
|---------|-------------|------------------|
| "The [Concept] Trap" | "The Initialization Trap" | "Import vs. Initialize: DDF Metadata Destruction Risk" |
| "The [Adjective] [Noun]" drama | "The Hidden Danger" | "Firmware Corruption After Sudden Power Loss" |
| "The [Noun] [Dramatic Noun]" | "The Silent Killer" | "Gradual Bad Sector Growth on Aging Platters" |
| "Why [Action] [Dramatic Verb] [Object]" | "Why Rebuilding Destroys Everything" | "How Forced Rebuilds Overwrite Parity on Degraded Arrays" |
| "[Noun]: The [Adjective] [Noun]" | "Encryption: The Hidden Trap" | "Hardware AES-256 Encryption on WD Passport Bridge Boards" |
| "The [Noun] You [Emotion Verb]" | "The Risk You Overlook" | "Unmonitored SMART Threshold Warnings" |

### How to Self-Check Headings

1. Could this heading serve as a thriller chapter title or YouTube clickbait thumbnail? If yes, rewrite it.
2. Does the heading describe what the section contains, or does it tease it? Headings describe; they do not tease.
3. Remove "The" from the beginning of any heading and check if it still uses a dramatic noun pairing. If so, rewrite.
4. A good heading reads like an entry in a technical manual index: specific, descriptive, and boring to non-specialists.

---

## Filler Words and Empty Intensifiers

These words often add nothing to meaning. Remove them or find specific alternatives:

- absolutely
- actually
- basically
- certainly
- clearly
- definitely
- essentially
- extremely
- fundamentally
- dramatically
- exceptionally
- remarkably
- literally
- incredibly
- interestingly
- naturally
- obviously
- quite
- really
- significantly
- simply
- surely
- truly
- ultimately
- undoubtedly
- very

---

## Academic filler

| Avoid | Use Instead |
|-------|-------------|
| shed light on | clarify, explain, reveal |
| pave the way for | enable, allow, make possible |
| a myriad of | many, numerous, various |
| a plethora of | many, numerous, several |
| paramount | very important, essential, critical |
| pertaining to | about, regarding, concerning |
| prior to | before |
| subsequent to | after |
| in light of | because of, given, considering |
| with respect to | about, regarding, for |
| in terms of | regarding, for, about |
| the fact that | that (or rewrite sentence) |

---

## Appropriate hedging

State uncertainty where the evidence warrants it, including disputed claims,
pending decisions, and incomplete validation. Tie the qualification to its basis.
Remove stacked qualifications that add no information. Do not impose a numeric
hedging threshold or strengthen a claim beyond its evidence.

## Structure and markup

Vary paragraph and section shapes when repetition adds nothing. Keep parallel
lists, procedures, comparisons, and template fields. Do not infer authorship
from sentence lengths, paragraph counts, or word choices.

Resolve stray citation placeholders in finished prose to real references or
remove unsupported claims. Preserve those strings when discussing them or
showing code; their presence is not proof of authorship.

## Self-check

Apply the self-check in SKILL.md. Use these catalogs to locate passages worth
reviewing, then assess meaning and evidence. Preserve relevant negative findings,
requested methods, progress reports, failures, and blockers.
