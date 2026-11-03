# 4A-1 browser run — what to do in the test window

The isolated profile's chat pane is broken by a **DSH build defect**, not by this
plugin: the host's own `conversation.session` slot throws

```
TypeError: text.replace is not a function
    at DraftEditorRuntime.setDraft
```

so the composer accepts text but the conversation renders nothing. Three
`api/session/prompt` calls returned HTTP 200 with zero messages painted, both
before and after a reload. Any card I try to draw through automation therefore
disappears into a pane that cannot paint it.

You are doing the one step automation cannot: **sending the prompt yourself.**

## Where

The **Agent Window** Edge opened for this session — the window showing
`http://127.0.0.1:3093/`, not your normal browser window. Your production app on
`:61582` is a different window and is not used by this test.

If you cannot find it, run this and use the URL it prints:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3093/' -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

## What to send

Type this into the composer and press Enter (or click 发送消息):

```
Use visualize with backend "openui", title "A1 layout". One statement per line, no explanation.
root is Col gap 4 with these children in order:
Box col gap 2 padding 3 background "info" radius "md" border "l2" holding Title "Box nesting" and a Row gap 2 with Text "left" and Text "right";
Box row gap 3 padding 2 background "success" radius "lg" width 240 holding Text "fixed 240";
Box row gap 2 padding 2 background "warning" radius "lg" flex 1 holding Text "elastic";
Row gap 2 with Text "before", Spacer, Text "after";
Divider;
Grid 2 columns gap 3 with Box col gap 1 padding 2 background "danger" radius "sm" border true holding Text "cell one", and a Col holding Text "cell two" and Caption "second line";
Grid minChildWidth 180 gap 2 with Text "auto a", Text "auto b", Text "auto c";
Grid 3 columns with Text "three a", Text "three b", Text "three c";
and an empty Grid.
```

Everything must keep the title **`A1 layout`** — that is how the probe finds the
card.

If the model refuses to open the card in that pane, that is itself the finding:
say so and I will record the gate as blocked against the host build rather than
against 4A-1.

## What happens next

Once the card exists, tell me and I run the measurement — no host CSS is
modified, and nothing is restyled to help it pass:

| Probe | Reads |
| --- | --- |
| `a1-probe.mjs` | every referenced CSS variable, whether it is declared on the card root, and whether the host token it names exists on `document.body` |
| | each Box's computed background, border, padding, radius, flex and pixel size |
| | each Grid's resolved `grid-template-columns`, column count, gap and per-cell geometry |
| | each Divider's real painted height and colour, and its opacity/visibility |
| | each Spacer's flex, floor, and the **measured pixel gap** between its two siblings |
| | the empty Grid, distinguished from any `data-openui-unrendered` notice |

Then the same probe in dark theme, a reload, and a history replay.
