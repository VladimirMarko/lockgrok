# Skills provenance and maintenance

These are locally maintained copies, installed with the skills CLI in another
project and then copied here. Upstream authors are credited as sources; this
project does not represent them or claim their endorsement.

[installation-lock.json](installation-lock.json) preserves the installation
record from that project verbatim. Its source paths and computed hashes describe
the installed baseline, not the current modified files. The record contains no
commit IDs. It is retained as historical evidence, not as an active update lock.

## Sources and license evidence

All entries in the installation record except no-ai-slop name
[mattpocock/skills](https://github.com/mattpocock/skills). Its MIT license is
preserved in [mattpocock-skills-MIT.txt](../../third-party-notices/mattpocock-skills-MIT.txt),
retrieved at revision `5beb35b040e3de97e54fa9e386d7e42d15c295c2`.
This is the license evidence revision, not a recovered installation revision.

The pr skill adapts Dex Horthy's show-me material from
[humanlayer/skills](https://github.com/humanlayer/skills/tree/653b6411c1f70c275a18e37673b042ff99f67ceb/plugins/show-me/skills/show-me).
Its MIT license is preserved in
[humanlayer-skills-MIT.txt](../../third-party-notices/humanlayer-skills-MIT.txt),
retrieved at that revision. The skill's existing metadata identifies this source;
the former credits link to the HumanLayer application repository was too broad.
The precise revision originally copied has not been recovered.

The no-ai-slop fork's
[permission record](../../third-party-notices/no-ai-slop.txt) preserves the
author's quoted invitation to incorporate the rules and the maintainer's
2026-10-23 decision accepting it as sufficient for this project's publication.
Its referenced source revision is `35e32ae45878148a6bd898572a9d15c96711affe`.
The root ISC grant does not relicense these third-party skills.

## Local changes

The no-ai-slop rules were repaired and substantially rewritten: the full rules
are included locally, technical and quotation exceptions are explicit, fabricated
examples are labeled, and unsupported detector claims were removed.

At the time this record was created, these files also differed from the source
project's current copies: prototype/UI.md, retro/SKILL.md,
setup-matt-pocock-skills/triage-labels.md, teach/SKILL.md, and
writing-for-agents/SKILL.md. This comparison is not a complete upstream diff;
changes may already have existed in the source project.

originator-review is absent from the installation record. It was added locally
in the source project (conaled), in commit
`fc13de99ee2ef0ce4d7b69d19ff49e2dccb83d7f` by Vladimir Marko, and later revised.
It is not attributed to Matt Pocock, HumanLayer, or the no-ai-slop upstream.

Preserve these copies and review upstream changes before applying updates.
Record newly established source revisions and material modifications here.
Do not use the installation hashes as claims that the current files are pristine.
