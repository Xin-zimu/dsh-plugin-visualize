# Stage 6 — the capability skips are proven, not papered over

Date: 2026-11-06. Commit: 8788ee0. CI run: 42154196690.

Four tests skip on this Windows machine because they need `SeCreateSymbolicLinkPrivilege`.
The only way that could be a way of hiding failures is if they skip on the machines that
*do* have the privilege. They do not — they run and pass there.

| Platform | passed | failed | skipped | total | gate |
| --- | --- | --- | --- | --- | --- |
| This machine (Windows 11, no Developer Mode) | 942 | **0** | 4 | 946 | local run, exit 0 |
| CI `ubuntu-latest` | **946** | **0** | **0** | 946 | `linux: expected 0 failures, found 0` |
| CI `windows-latest` | **946** | **0** | **0** | 946 | `windows: baseline 15, found 0, new 0` |

**Read the skip column.** 4 locally, 0 on both CI platforms, and the totals are 946 in
all three cases. So the four tests are not excluded from the project's verification —
they are deferred to the machines that can execute them, and they pass there.

## The four, and why each needs a real file symlink

| Test | Property under test |
| --- | --- |
| `card-images :: refuses to serve an image reached through a symlink` | the image route opens only regular files below the store, resolved |
| `images :: refuses a file symlink that leaves the workspace` | a workspace image is not read through a link that exits the tree |
| `storage :: refuses a file symlink inside the workspace that points out of it` | a legacy card path is not patched through such a link |
| `style-files :: refuses a style file that is a symlink, for reads and writes` | the style route refuses a link for both read and write |

Each is a **containment** property. A hardlink cannot stand in for any of them: it
shares an inode, so the file is not reached *through* anything, `realpath` cannot see it,
and the property does not exist. Using one would have made four security tests look
green while testing something else entirely — the failure mode
`docs/testing/PLATFORM-FAILURES.md` warns about, where a skip added to hide a failure
keeps hiding whatever comes after it.

## What was NOT skipped

Six of the original containment failures needed a symlink. Only **four** skip, because
the other two needed a *directory* link, which a junction covers:

- `images :: refuses a directory link that leaves the workspace`
- `storage :: refuses a directory link inside the workspace that points out of it`
- `storage :: never reads a file outside the store with its own fs`
- `style-files :: refuses a workspace whose .dsh directory links out of it`

A junction is a real reparse point that `realpath` resolves through, so those tests
execute the real containment check here rather than deferring it. That is four security
assertions kept live on the local platform that would otherwise have been skipped.

## The baseline comparison

`windows: baseline 15, found 0, new 0` — the CI gate still compares against the v0.1.0
failure set, and finds **none of the 15 remaining**. It did not fail when baseline
failures started passing, because that gate was written to treat a better environment as
a better build rather than an error (`15814e3`).

The suite also grew: 939 tests at v0.1.0, **946** now. Seven tests were added (tilde
round trip x2, abort-at-entry, the directory-link splits, and the stronger description
assertions), and none were removed.