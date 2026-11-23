// Hand-built faithfulness cases for the verifier.
// Each case is a rewrite that either keeps the meaning or breaks it in one
// specific way. The verifier runs alone here, so this measures the checker,
// not the writer.
export const CASES = [
  {
    id: "synonym-1",
    expected: true,
    note: "plain synonym swap",
    original: "The hippocampus replays patterns of activity during slow-wave sleep.",
    rewrite: "The hippocampus repeats activity patterns during slow-wave sleep."
  },
  {
    id: "synonym-2",
    expected: true,
    note: "synonyms plus dropped filler words",
    original: "The effect was largest for items that had been rated as difficult at encoding.",
    rewrite: "The effect was biggest for things that were rated hard to learn."
  },
  {
    id: "qualifier-kept",
    expected: true,
    note: "hedge and percentage preserved",
    original:
      "Participants who slept for at least 7 hours retained roughly 20 percent more items than participants who stayed awake.",
    rewrite:
      "People who slept at least 7 hours remembered about 20 percent more things than those who stayed awake."
  },
  {
    id: "number-kept",
    expected: true,
    note: "year and count preserved",
    original:
      "A 2019 review of 41 experiments concluded that sleep after learning improves retention in most conditions.",
    rewrite:
      "A 2019 review of 41 experiments found that sleeping after learning helps people remember in most cases."
  },
  {
    id: "split-sentence",
    expected: true,
    note: "one clause turned into its own sentence",
    original:
      "Several meta-analyses report that the benefit of sleep on declarative memory is moderate rather than dramatic.",
    rewrite:
      "Several reviews of many studies looked at sleep and memory for facts. They found the benefit is moderate, not dramatic."
  },
  {
    id: "advice-kept",
    expected: true,
    note: "same caution, simpler words",
    original:
      "Researchers therefore caution against treating sleep as a substitute for retrieval practice.",
    rewrite: "So researchers warn that sleep should not replace practice at recalling things."
  },
  {
    id: "dropped-hedge",
    expected: false,
    note: "may became does",
    original: "Sleep may help consolidate memory.",
    rewrite: "Sleep consolidates memory."
  },
  {
    id: "dropped-at-least",
    expected: false,
    note: "at least removed",
    original:
      "Participants who slept for at least 7 hours retained roughly 20 percent more items than participants who stayed awake.",
    rewrite:
      "Participants who slept 7 hours retained roughly 20 percent more items than participants who stayed awake."
  },
  {
    id: "dropped-roughly",
    expected: false,
    note: "approximation became exact",
    original: "The treatment lowered blood pressure by roughly 12 points.",
    rewrite: "The treatment lowered blood pressure by 12 points."
  },
  {
    id: "percent-to-most",
    expected: false,
    note: "30 percent became most",
    original: "The drug reduced symptoms in 30 percent of patients.",
    rewrite: "The drug reduced symptoms in most patients."
  },
  {
    id: "species-swap",
    expected: false,
    note: "mice became people",
    original: "In mice, the treatment slowed tumor growth.",
    rewrite: "The treatment slows tumor growth in people."
  },
  {
    id: "number-swap",
    expected: false,
    note: "41 became 14",
    original: "The review covered 41 experiments.",
    rewrite: "The review covered 14 experiments."
  },
  {
    id: "dropped-only",
    expected: false,
    note: "only removed, widening the group",
    original: "Only participants without a history of migraine were included.",
    rewrite: "Participants without a history of migraine were included."
  },
  {
    id: "some-to-all",
    expected: false,
    note: "some became all",
    original: "The benefit was observed in some age groups.",
    rewrite: "The benefit was observed in all age groups."
  },
  {
    id: "reversed-comparison",
    expected: false,
    note: "difficult became easy",
    original: "The effect was largest for items rated as difficult at encoding.",
    rewrite: "The effect was largest for items rated as easy at encoding."
  },
  {
    id: "added-cause",
    expected: false,
    note: "correlation became cause",
    original: "People who nap more often report better mood.",
    rewrite: "Napping more often causes better mood."
  },
  {
    id: "real-world-paraphrase",
    expected: true,
    note: "found in a live run: heavy paraphrase, same caution",
    original:
      "Researchers therefore caution against treating sleep as a substitute for retrieval practice, which remains one of the most reliable ways to strengthen memory.",
    rewrite:
      "Researchers warn not to use sleep as a replacement for practice at recalling things, which is still one of the most dependable ways to strengthen memory."
  }
];
