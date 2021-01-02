## prosemirror-collab playground

A place to experiment with prosemirror-collab. At the moment, the demo page shows a few editors communicating via a central authority, which is currently, but not necessarily, client-based. 

A collab-selection plugin shows the 'remote' users' selections. Although we don't need to maintain a history of edits (the selection does not need to be rebased through changes), the plugin stores a 'version' of the selection to ensure that consumers only need respond to fresh changes.

I have questions:

- should the selection state be managed by a separate service? This appears to be the approach taken by the [NYT](https://open.nytimes.com/we-built-collaborative-editing-for-our-newsrooms-cms-here-s-how-415618a3ec49), as the cursor has different requirements and constraints (it doesn't need to be persisted; it does need to be cleaned up when the corresponding editor quits)
- how might we store the steps associated with editing to enable a 'track changes' or editing history approach?

Also todos:

- Handle caret stacking so multiple carets at the same position aren't hidden
- CSS fanciness to only show usernames when necessary

## Install

Requires Yarn. In the root of the project,

`yarn`

## Run

`yarn watch`
