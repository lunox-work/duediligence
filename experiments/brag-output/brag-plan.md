# /brag plan: double-blind

## Answers

- **What it is:** hidden acceptance tests for coding agents. The agent works against one test suite; a second suite it never sees decides the verdict.
- **For whom:** teams merging agent-written code, and anyone paying for work on evidence instead of review.
- **What sets it apart:** the agent cannot see, edit or game the suite that judges it. The grader returns a verdict and a failing scenario, never the test.
- **Most impressive claim (measured):** on patch-apply, Haiku 5.5 with independent visible tests was correct 20 of 20 times; from the spec alone, 7 of 20.
- **Funniest true moment:** a regex with two capture groups, and the code reads the second and the fourth. Every visible test passed.
- **Visual hook:** a green test run, then a second panel slides in and turns red.
- **Real UI:** the terminal. Real test counts, the real buggy lines from `runs/reverse-diff/double-blind-haiku/3`, real result counts from `results.jsonl`.
- **Tone:** `polished`, with default-tone punch on the cuts. Crisp monochrome per the Lunox web direction; green and red only for pass and fail.
- **Caption:** "Your coding agent's tests pass. Ours didn't."

## Angle

Green CI is the agent grading its own homework. Show one real run that passed every test it could see and failed the ones it could not, show the bug, then the measured number.

## Identity

- Background `oklch(0.129 0.042 264.695)`, panel `oklch(0.16 0.03 257)`, raised `oklch(0.2 0.034 257)`, border white 11%.
- Text `oklch(0.984 0.003 247.858)`, muted `oklch(0.704 0.04 256.788)`.
- Pass `oklch(0.72 0.16 159)`, fail `oklch(0.64 0.21 16)`, accent `oklch(0.76 0.15 225)`.
- Fonts: Space Grotesk (display), DM Sans (body), DM Mono (code). All from the Lunox landing.

## Music

120 BPM, 4/4, A minor (Am F C G, one chord per bar). Beat = 0.5 s, bar = 2 s. Every cut lands on a beat.

## Storyboard (20 s, 1920×1080, 30 fps)

| # | Time | Beats | Scene | On screen |
|---|---|---|---|---|
| 1 | 0.0–3.0 | 6 | Hook | Terminal types `npm test`; 16 green ticks fill; "16 / 16 passed". Caption: "Your agent's tests pass." |
| 2 | 3.0–6.0 | 6 | Reveal | Terminal slides left; a second panel "hidden suite · never shown to the agent" slides in; 42 ticks, 3 turn red; "39 / 42". Caption: "Ours didn't." |
| 3 | 6.0–10.0 | 8 | Highlight 1: the bug | The real regex line with its two groups marked ①②, then the two lines reading `m[2]` and `m[4]`; `m[4]` underlined red. Caption: "Two capture groups. It reads the fourth." |
| 4 | 10.0–14.0 | 8 | Highlight 2: hero number | Two rows of 20 dots fill. "Spec only" 7/20; "Independent tests" 20/20. Footnote: "patch-apply · Claude Haiku 5.5 · 20 runs each". |
| 5 | 14.0–17.0 | 6 | Highlight 3: scale | "18 of 511 green runs failed the hidden suite." Small line: "0 of 550 touched the tests." |
| 6 | 17.0–20.0 | 6 | Outro | Wordmark "double-blind". "Hidden tests for coding agents." "lunox.work". |

Transitions: old content out over 0.2 s, new content in, dipping through the background; no crossfades of busy layouts.

## Data and privacy

No names, keys, hosts or customer data. The code lines are the agent's own submission on a synthetic spec. "lunox.work" stands in as the call to action until the one-click try path is decided.
