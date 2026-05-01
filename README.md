# Tag Database

## Ideas

### Natural-language intent is now part of the source base

Natural-language intent is now part of the source base, not merely commentary around it.

Source code remains important, but it is no longer the only material that determines how a system is built, maintained, and reproduced. As code agents become better at implementation, more of a project's durable value moves into the intent-bearing materials around the code: design notes, proposals, constraints, prompts, review comments, commit messages, meeting notes, architectural decisions, and inline explanations.

These materials are not secondary documentation. They contain the judgments that decide what should be built, why it should be built that way, which tradeoffs were accepted, which constraints must be preserved, and which changes are unsafe. A project can remain syntactically valid while losing the reasoning that made the implementation coherent.

Traditional code tools remain necessary, but they mostly operate on implementation artifacts. Linters, type checkers, formatters, and tests check code. The emerging gap is higher-level: projects also need tools that can analyze, structure, check, and preserve natural-language intent with comparable discipline.

This project treats natural-language source as a first-class engineering material. Commit messages, comments, design documents, prompts, proposals, and structured notes should remain writable as text, but they should also be available for validation, indexing, querying, compilation, and controlled disclosure.

### Structured text needs a portable object layer

Structured text needs a portable object layer that is not bound to a single language, application, or file format.

Structured text has been reinvented many times as local conventions: documentation comments, Markdown front matter, task lists, tags, wiki-style links, embedded metadata, notebook cells, queryable notes, and application-specific annotation formats. These mechanisms let ordinary text carry objects, fields, relationships, states, constraints, and references.

The problem is not that these mechanisms are useless. The problem is that each is usually meaningful only within its own host: a particular language, editor, plugin ecosystem, documentation generator, note-taking system, or storage model. A field written in one system cannot reliably be queried by another. A note embedded in source code cannot naturally share an object model with a planning document. A task, a design constraint, a prompt instruction, and an implementation note may refer to the same work while remaining invisible to one another.

Structured text should not be trapped in local conventions. A text object should be able to appear in different host formats, be extracted by host-specific adapters, and then participate in a shared model for querying, indexing, validation, compilation, and reuse.

### Human-agent collaboration needs an explicit mediation layer

Human-agent collaboration needs an explicit mediation layer, not only shared access to the same repository.

A repository gives humans and agents a common place to work, but it does not by itself define how they should understand each other. Humans communicate through intent, priorities, warnings, review expectations, design rationale, and change protocols. Agents operate through retrieval, planning, generation, tool calls, and edits. Without a structured mediation layer, these modes meet only through ordinary prose and best-effort interpretation.

That is too weak for serious engineering work. A human may need to say that a region is safe to refactor but not to redesign, that a generated file must be changed through its source template, that a prompt instruction is runtime-visible but its rationale is private, that a decision is tentative, or that a change requires review from a specific owner. These statements are not merely documentation. They are collaboration signals that should guide how agents search, plan, modify, compile, and ask for confirmation.

Existing code tools do not fully cover this role. Type checkers, linters, tests, and formatters can check implementation artifacts, but they do not provide a general channel for structured human intent. Repository search and RAG can retrieve relevant text, but retrieval is not the same as a contract: it does not define scope, priority, visibility, responsibility, or required behavior.

This project treats structured text as the mediation layer between humans, tools, and agents. It should allow humans to write intent, constraints, responsibilities, prompts, review requirements, and modification protocols as source-controlled text, while allowing agents and tools to consume that material mechanically. The goal is not only to store knowledge near the source, but to make that knowledge usable as an active coordination interface.

### Source-controlled text should support multiple views

Source-controlled text should remain canonical without becoming the only useful view of the data.

A source file is a good durable representation for certain kinds of knowledge, but it is not always the best interface for reading, reviewing, planning, searching, or coordinating that knowledge. The same source-controlled data may need to be viewed by status, owner, topic, dependency, target artifact, affected module, review requirement, generated output, or release scope.

Databases and project tools commonly support such projections. Source-centered systems often do not. They tend to treat the textual layout as the primary interface as well as the canonical representation.

This creates pressure to move structured knowledge out of source-controlled text and into external tools, even when the knowledge logically belongs with the source. Users want the durability, reviewability, and merge behavior of plain text, but they also need tables, filtered lists, grouped views, dependency views, dashboards, generated documents, and other projections over the same underlying data.

The source text should remain the durable representation, but it should not be the only working representation. A structured-text system should allow embedded objects to be queried, indexed, grouped, projected, and rendered into multiple views without changing where the canonical data lives.

### Source-attached knowledge should move with the source

Source-attached knowledge should stay close to the artifact it explains and move through source control with it.

Engineering work often separates an artifact from the knowledge needed to understand and modify it. Proposals live in documents, decisions live in issue trackers, implementation notes live in review threads, bookmarks live in editors, and constraints live in project-management systems. These tools are useful for discussion, but they are weak long-term homes for knowledge that belongs to a specific source artifact.

When the artifact changes, the external explanation often fails to move with it. Links become stale, sidecar annotations drift, and the connection between the artifact and its rationale becomes difficult to recover.

Inline plain text has better source-control properties. It is reviewed with the change, branched with the change, diffed with the change, merged with the change, blamed with the change, and preserved by ordinary version-control tools. For knowledge that is genuinely attached to a file, declaration, function, section, or region, this locality is part of what makes the knowledge maintainable.

Ordinary comments and Markdown text, however, do not provide enough structure. They can preserve locality, but they cannot reliably express queryable proposals, typed fields, reusable decisions, prompt definitions, task records, generated documentation, or indexed constraints. The goal is to remove the false choice between locality without structure and structure without source-control locality.

## Approach

### A Markdown dialect as the default authoring format

The default authoring format is a Markdown dialect for structured text.

It should allow users to write prose while also declaring objects, fields, references, nested structures, anchors, and visibility boundaries. It follows Markdown's plain-text authoring model, but it may introduce syntax that requires dedicated parsing and rendering. Its purpose is to provide a readable, writable, diffable, and maintainable default format for structured text.

This dialect should work in standalone Markdown-like documents and in text regions such as Markdown comments or source-code comments. It is the default way to write structured objects by hand, but it is not the only way to provide structured data to the system.

### Adapter plugins as source integration layers

Host formats are connected through adapter plugins. An adapter is responsible for connecting external artifacts to the structured-text system.

An adapter may support four capabilities:

- **Extraction**: read structured data from a host artifact, such as a Markdown file, source-code comment, YAML file, front matter block, configuration file, generated file, or project-specific format.

- **Source mapping**: preserve both where structured data came from and what it points to. A function comment may come from a source-code range and point to the function it documents. A video sidecar entry may come from a sidecar file and point to a specific segment of the video. Both links matter: the extracted object must be traceable to its origin and to its target.

- **Sidecar discovery**: attach structured data to artifacts that cannot or should not be modified directly. Images, videos, audio files, design files, binary assets, generated outputs, and third-party files may need sidecar files rather than embedded annotations.

- **Editing**: when safe, apply structured-object changes back to the embedded block, host file, or sidecar file that owns the data. If an adapter cannot edit a source safely, it should expose the object as read-only or report the limitation explicitly.

This makes adapters more than parsers. They are the project's extension mechanism for bringing external artifacts into the system while preserving their connection to source. Different adapters may support different levels of capability, but extraction without source mapping is not sufficient for this project.

### A declarative language for definitions, queries, indexes, and views

Projects should be organized through a declarative language that describes how structured objects are defined, found, indexed, validated, and presented.

The language should cover four main areas:

- **Definitions**: declare object shapes, fields, constraints, visibility rules, and relationships.

- **Queries**: select, filter, order, group, and project structured objects across files and adapters.

- **Indexes**: declare which fields, references, source locations, or relationships should be optimized for lookup.

- **Views**: define reusable projections such as tables, grouped lists, dashboards, source-linked reports, generated documents, and prompt assemblies.

This language is the project-level organization layer. It turns extracted structured objects into a searchable and maintainable library, and gives both humans and agents a stable way to ask questions about the same underlying text.

### Human and agent interfaces

The system should provide practical interfaces for both humans and agents.

Human users need readable interfaces for navigating structured objects: tables, grouped lists, source-linked reports, generated documents, dashboards, and other project-specific views. Agents need mechanical interfaces for querying objects, inspecting source mappings, running validations, generating outputs, and applying supported edits. These interfaces may be delivered through UI views, CLI commands, and plugin APIs.

These surfaces make the system usable in real workflows, but they are not the core of the design. They should remain replaceable and extensible as the project evolves.

## Implementation

### Markdown syntax

The Markdown syntax is implemented as a remark plugin.

The plugin should be implemented as a real Markdown syntax extension, not as an ad hoc text replacement layer. It should introduce explicit syntax-tree nodes for the dialect, preserve source positions, integrate with the mdast ecosystem, support serialization where appropriate, and include fixture-based tests for parsing, stringifying, escaping, multiline values, attachment rules, and source mapping.

The syntax introduces two independent structures: tags and properties.

A tag marks a block with a globally defined classification:

```md
Runtime prompt boundary #Decision
```

A property attaches a named value to a block:

```md
Runtime prompt boundary

Status:: Accepted
Visibility:: Private
```

Tags and properties are separate structures. They may appear together, but neither depends on the other. A block may have tags without properties, properties without tags, or both. Properties do not belong to a specific tag; tags and properties meet on the block they annotate.

Tag parsing is definition-aware. A `#Name` sequence is treated as a tag only when `Name` is defined as a tag in the project configuration. Undefined hashtag-like text remains ordinary Markdown text. This prevents the dialect from reinterpreting every `#word` as structured data.

For example, if `Decision` is defined but `region` is not, this text contains one structured tag and one ordinary marker:

```md
Runtime prompt boundary #Decision

C# example: #region generated code
```

This rule is important because `#` already appears in many conventions: region markers, issue references, URL fragments, informal hashtags, anchors, and examples copied from other languages. A project should decide which names are meaningful instead of letting the parser convert every hashtag-shaped token into data.

Property parsing follows the same global naming discipline. A property marker has the form:

```md
Name:: value
```

Property names cannot contain spaces. If a property needs a display name with spaces, that should be handled by definitions or aliases, not by the base syntax.

A detached tag or property attaches backward to the nearest eligible content block. This allows structure to be written below the text it describes:

```md
Runtime prompt boundary

#Decision
Status:: Accepted
Visibility:: Private
```

This is interpreted as:

```txt
block: "Runtime prompt boundary"
tags:
  - Decision
properties:
  Status: Accepted
  Visibility: Private
```

The detached tag line is not a separate object. The property lines are not children of the tag. They are attachments to the same preceding content block.

Inline forms are also allowed when compactness is useful:

```md
Runtime prompt boundary #Decision Status:: Accepted Visibility:: Private
```

This is equivalent to the detached form. The detached form is preferred when more than one property is present.

A property value may be unquoted, quoted, or multiline:

```md
Status:: Accepted
Title:: "Runtime prompt boundary"
Reason:: 'Do not expose private rationale.'
```

Multiline quoted values use triple single quotes or triple double quotes. Backticks are not used as value delimiters.

```md
Rationale:: """
  Runtime prompts may include final instructions.

  They must not include private design rationale.
  """
```

The indentation needed to place a multiline value in the Markdown document is not part of the value. Multiline values are dedented before storage, while preserving the relative indentation of the content itself.

The fixed markers are:

```txt
#Name       tag candidate, resolved only if defined
Name::      property marker
"..."       single-line quoted value
'...'       single-line quoted value
"""..."""   multiline quoted value, dedented
'''...'''   multiline quoted value, dedented
```

The Markdown dialect therefore adds two attachable structures to Markdown blocks: tags and properties. It does not require a tag to define a property scope, and it does not require a property to appear under a tag. Both structures attach to blocks according to the dialect's attachment rules.
