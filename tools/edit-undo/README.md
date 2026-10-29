# Edit Undo — experimental preview

Compare **before the AI window**, **after the AI window**, and **now**. Preview
an inverse text merge that can retain later edits in the same file.

This is a local prototype, **not a recovery product**. It has no apply command
and changes neither your selected files nor Git's index. Conflicts are left for
review. Recording must start before the edit window; concurrent edits within
that window cannot be attributed to AI or a person.

Requires Node22+ and Git. No model calls, remote service or npm dependencies.

```sh
node cli.mjs begin --project /your/project --session /outside/session --paths src/example.js
# Run one AI edit window.
node cli.mjs seal --session /outside/session
# Make any later human edits.
node cli.mjs preview --session /outside/session --html /outside/preview.html
```

Select 1–32 relative UTF8 text files (at most1MiB each); symlinks, Git internals,
environment files and binary input are rejected. The session stores the selected
source locally; the HTML contains it too. Keep both private. Overlapping
new/deleted-file edits and changed file modes are not merged. The prototype
assumes no concurrent file mutation while capturing or previewing.

Git's three-way text merge is existing technology. This prototype tests whether
recording, preserving later edits and reviewing the result as one workflow is
useful; it does not claim a new merge algorithm or verified independent adoption.

Run `npm test` for behavior tests using temporary synthetic files only.
