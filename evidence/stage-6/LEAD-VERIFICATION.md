# Stage 6 — Lead's independent verification of the three fixes

Date: 2026-11-06. HEAD before this round: 23b925b (v0.1.0).

Every claim below was re-derived by the Lead, not accepted from a teammate's report.
Scripts: tmp/probes/verify-tilde.mts, tmp/probes/tilde-security.mts,
tmp/probes/d2-verify.mjs, tmp/probes/get-desc.mts, tmp/probes/link-capability.mjs

## 1. The `~` round-trip bug — FIXED, and the security property survives

src/storage.ts now expands a `~` display form under either separator via
isDisplayPath()/expandDisplayPath(), instead of only `~/`.

Independent check (tmp/probes/verify-tilde.mts):

    native display form : ~\AppData\Local\Temp\viz-home-X\visualize\sessions\s1\lab-ab12.whale.html
    posix display form  : ~/AppData\Local\Temp\...
    ownedPath(native)   : C:\Users\86139\AppData\Local\Temp\...\lab-ab12.whale.html
    ownedPath(posix)    : C:\Users\86139\AppData\Local\Temp\...\lab-ab12.whale.html
    NATIVE ROUND TRIP   : OK
    POSIX  ROUND TRIP   : OK
    ownedPath('~')      : REFUSED  (correct: home itself is not a card file)
    traversal still shut: yes

### The security check that had to pass

Widening a path reader is exactly where containment gets lost, so both entry points
were attacked with 8 shapes x 2 entry points = 16 attempts, in both separators
(tmp/probes/tilde-security.mts):

    ~/../../../../etc/passwd.html                    refused (both)
    ~\..\..\..\..\etc\passwd.html                   refused (both)
    ~\..\secret.html                                 refused (both)
    ~/../secret.html                                 refused (both)
    ~                                                refused (both)
    ~\                                               refused (both)
    ~/x/../../../../Windows/win.ini.html             refused (both)
    ~\AppData\..\..\..\..\Windows\win.ini.html      refused (both)

    TOTAL ESCAPES: 0

So the round trip was repaired without loosening containment: expansion happens first,
then the existing resolve/inside/realpath checks run unchanged on the expanded result.

## 2. The 5,020 ms timeout — it was never a slow test

The timeout was a MASK. Chain, corroborated independently by two agents:

1. displayOf() emitted `~\AppData\...`, ownedPath() refused it (not absolute), and
   workspacePath() then ACCEPTED it as a workspace-relative path, because the literal `~`
   directory appears inside the workspace. The update was misrouted into the legacy
   workspace branch and died there.
2. resolveCardImages was never reached, so the test's fetchUrl stub was never called.
3. The test awaits a promise that only the stub can resolve, so `await fetching` never
   settles. The update's real rejection went unawaited and surfaced as an unhandled
   rejection while vitest killed the test at its 5 s bound.
4. STACK_TRACE_ERROR was the JSON reporter's synthetic stack for a timeout, which is why
   the message named nothing. The real error was printed under Unhandled Errors and ignored
   for two stages.

Control experiment (evidence/stage-6/timeout-control-experiment.txt): identical test body,
store home moved out of homedir -> passes in 67 ms; home under homedir -> hangs. So it is a
property of the PATH, not of machine speed.

**Stage 5 recorded this failure as 'a timeout is not a diagnosis'. It was right, and the
diagnosis had been sitting in the same output the whole time.** The framing lesson is worth
more than the fix: a timeout bound converts any unawaited-failure bug into an opaque one.

## 3. The tool description fixture — the assertion was mis-written, not the fixture

Independently reproduced (tmp/probes/get-desc.mts + the two regexes):

    OLD  /read the same contract from (\S+\.md)/     -> NO MATCH -> undefined
    NEW  /read the same contract from (.+?\.md)\s/u   -> the absolute path

The description DOES name the file. The old regex could not carry it because `\S+` stops at
the space in `D:\Deepseek WorkSpace\...`. The fixture was never at fault, so the task's
original two options (register a provider, or relax the assertion) were both wrong.

The replacement assertion is STRONGER than the original: it requires the captured path to be
absolute, to exist, to be a regular .md file, and it verifies the relative references the
sentence promises (`references/charts.md`, `references/design.md`,
`examples/interactive-simulator.html`) actually exist beside it. Verified by the Lead that
all resource files exist. tests/tool.spec.ts: 7/7 passing.

## 4. Symlink capability on this machine — measured, not assumed

    file symlink (fs.symlink)              EPERM
    directory symlink (type: 'dir')        EPERM
    directory junction (type: 'junction')  OK
    file hardlink (fs.link)                OK  (but NOT a substitute - see STAGE.md)
    junction realpath()                    resolves through

Consequence: the directory-escape half of each containment test can run here via a junction;
the file-link half cannot, because a hardlink shares an inode so `realpath` cannot see it and
the property under test does not hold at all. Substituting one would test a different property
while appearing to cover the original.