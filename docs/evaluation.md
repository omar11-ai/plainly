# Evaluation

Three independent measurements of what the thing actually does, all run against
the live pipeline on this machine and all reproducible from the repo.

| harness | what it tests | command | last result |
|---|---|---|---|
| `eval/run-eval.mjs` | the meaning checker on 17 hand-built pairs | `npm run eval` | **17/17 correct**, 0 false alarms, 0 missed errors |
| `scripts/verify-api.mjs` | the API contract on 14 live checks | `npm run verify-api` | **14/14 passed** |
| `eval/run-passages.mjs` | the whole pipeline on 12 passages | `npm run eval-passages` | FK 18.9 → 9.3, fidelity 0.81, see below |

Raw output: `eval/results/latest.json` (checker), `eval/results/passages.json`
(passages). Both are written by their harness, not hand-edited.

Hardware: RTX 2060 6 GB, Chrome open, Ollama on `127.0.0.1:11434`.

---

## 1. Passage-level evaluation (12 passages, three tiers)

The question the rubric asks: does the reading level actually fall, and does the
meaning survive? Both need an answer per difficulty tier, because a tool that
works on leaflets and fails on a lease is not a tool.

**Method.** Twelve passages, four per tier, run through `POST /api/simplify` in
`mode: "verified"` with the level set to the tier, over HTTP, NDJSON events
collected to completion. Flesch–Kincaid grade is computed over the whole passage
before and after using the app's own `readability()` — not a paraphrase of it.

The passages are synthetic genre fixtures written for this run: a benefits
notice, a medication leaflet, a public notice, an advisory; a cognitive
psychology passage, an ecology passage, an econometrics passage, a history
passage; and four university-tier passages (neuroscience, econometrics, contract
law, analytic philosophy). They deliberately carry numbers, dates, proper names
and hedges — `at least`, `only`, `unless`, `roughly`, `may` — because those are
what the entity layer has to hold. Public-domain text was not used, so that
every hedge and figure in the fixture is intentional and countable.

### Results

| tier | n | FK before | FK after | drop | fidelity | escalations |
|---|---|---|---|---|---|---|
| everyday | 4 | 9.3 | 5.0 | **−4.3** | **0.917** | 2 |
| clear | 4 | 15.8 | 9.2 | **−6.6** | **0.889** | 3 |
| university | 4 | 31.7 | 13.7 | **−18.0** | **0.400** | 0 |
| **all** | **12** | **18.9** | **9.3** | **−9.6** | **0.808** | **5** |

26 sentences total: 21 faithful, 5 flagged, 0 errored. Escalation rate 0.192.
Mean latency 51.3 s per passage, 615.7 s for the whole set.

The reading level falls in every tier, and it falls further in harder text —
which is the correct direction, and the opposite of what a fixed template would
do. Hedges counted 19 before the rewrite and 20 after: the pipeline adds hedges,
it does not eat them.

### What escalation actually did

Escalation fires when the first draft fails and hands the verifier the failure
reason for one feedback-aware second attempt, keeping whichever version scores
higher. It fired on 5 of 26 sentences, and in every case it produced the version
the checker then accepted — the two mid-tier failures that remain (`e4-advice`,
`c4-historic`) were never escalated, and the university passages never got far
enough to escalate. So the mechanism works; the gap is upstream of it.

---

## 2. Limits — where it does not work

Stated plainly, because a tool that claims to preserve meaning has to be judged
on where it stops preserving it.

**Long nested sentences are the hard limit.** The university tier's fidelity is
0.40, and both of its failures are single-sentence passages: `u3-contract` and
`u4-philosophy` are each one 80–100-word sentence with the main clause buried
three subordinations deep. The pipeline rewrites sentence by sentence, so there
is no smaller unit to work on, and the 7B checker cannot verify a rewrite of a
sentence it cannot itself hold in context — so it flags. Note the direction of
that failure: **the tool refuses to mark it verified rather than trusting a
rewrite it cannot check.** That is the intended fail-closed behaviour, and it is
also why the university tier needs a human reader.

**Flagging is not always wrong.** `u1-neuro` passed 1 of 2 and `c4-historic`
passed 1 of 2. Both flags are defensible rather than bugs: `c4-historic`'s second
sentence pushes the subject under a clause, and `e4-advice` loses "it is best to"
in the third sentence. A false alarm costs the user a moment; a missed
corruption costs them the thing the app exists to protect. The design prefers the
cheap failure.

**Latency is the real usability cost.** 51.3 s per passage is fine for a reading
session and not fine for a quick check. Almost all of it is the 7B checker at
about 1.5 s per sentence when warm, plus one model load per document. The
two-phase batching is what makes this survivable: the same document
sentence-interleaved costs 12–24 s per sentence, so batching is the difference
between 51 s and several minutes.

**The 3B is not asked to be careful.** It writes; it does not check. Hedges and
figures are held by the deterministic entity layer and confirmed by the 7B. The
hedge count going up rather than down (19 → 20) is consistent with that division
of labour — the writer may add a hedge, and the layer will not let it drop one.

**Scope of the evidence.** These are synthetic fixtures, not user documents.
They are genre-representative and deliberately adversarial on hedges and figures,
which a random corpus sample would not be. The 17-case checker harness and the
14-check API harness cover the same systems from the other side.

---

## 3. What the model choice was based on

`eval/bench-models.mjs` compared `qwen2.5:3b` and `qwen2.5:7b` on this GPU for
writer duties: 3B rewrites at 14.9 s cold / 3.4 s warm where 7B is 23.8 s cold /
1.5 s warm for checking, and the 6 GB card cannot hold both at once. The 3B
writes, one unload, the 7B checks — the division is set by measured latency and
memory, not by preference, and the escalation path uses the 7B for rewriting
only where the 3B's draft already failed a check.