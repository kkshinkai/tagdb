# tagdb

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
