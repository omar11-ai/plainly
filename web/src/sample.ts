import type { SentenceResult, VerifyPatch } from "./types";

export const QUICK_SAMPLE_TEXT = `How Sleep Shapes Memory

During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day, and these replays are thought to transfer newly encoded information into neocortical storage. In a frequently cited study, Walker and colleagues found that participants who slept for at least 7 hours after learning a list of word pairs retained roughly 20 percent more items than participants who stayed awake for the same interval. A 2019 review of 41 experiments concluded that sleep after learning improves retention in most, but not all, tested conditions, and that the evidence for sleep before learning is weaker.`;

export const SAMPLE_TEXT = `How Sleep Shapes Memory

Sleep is not a passive state in which the brain simply rests. During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day, and these replays are thought to transfer newly encoded information into neocortical storage. In a frequently cited study, Walker and colleagues found that participants who slept for at least 7 hours after learning a list of word pairs retained roughly 20 percent more items than participants who stayed awake for the same interval. The effect was largest for items that had been rated as difficult at encoding.

However, the relationship is not unlimited. Several meta-analyses report that the benefit of sleep on declarative memory is moderate rather than dramatic, and that it depends on the timing of sleep relative to learning. A 2019 review of 41 experiments concluded that sleep after learning improves retention in most, but not all, tested conditions, and that the evidence for sleep before learning is weaker. Researchers therefore caution against treating sleep as a substitute for retrieval practice, which remains one of the most reliable ways to strengthen memory.`;

export interface RecordedStep {
  draft: SentenceResult;
  verify: VerifyPatch;
}

export const RECORDED_PREVIEW_HEADING = "How Sleep Shapes Memory";

/**
 * Captured from a real verified run against local Ollama (qwen2.5:3b writer,
 * qwen2.5:7b checker) at Everyday + Scientific-kept. Used only as the offline
 * fallback when no Ollama daemon is reachable.
 */
export const RECORDED_PREVIEW_STEPS: RecordedStep[] = [
  {
    draft: {
      index: 1,
      original: "During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day, and these replays are thought to transfer newly encoded information into neocortical storage.",
      plain: "During slow-wave sleep, the hippocampus repeats the activity patterns from the day. This replay helps move new information to the neocortex for storage.",
      why: "Split the complex sentence into two simpler ones to make it easier to understand.",
      status: "checking",
      issues: [],
      entities: [],
      reason: "",
      model: "qwen2.5:3b",
      escalated: false,
      ms: 16546,
      readability: {
        before: {
          grade: 17.2,
          ease: 21.3,
          words: 28,
          sentences: 1
        },
        after: {
          grade: 9.4,
          ease: 48,
          words: 23,
          sentences: 2
        }
      }
    },
    verify: {
      type: "verify",
      index: 1,
      plain: "During slow-wave sleep, the hippocampus repeats the activity patterns from the day. This replay helps move new information to the neocortex for storage.",
      why: "Split the complex sentence into two simpler ones to make it easier to understand.",
      status: "faithful",
      issues: [],
      entities: [],
      reason: "",
      model: "qwen2.5:3b",
      escalated: false,
      verifyMs: 21646,
      readability: {
        before: {
          grade: 17.2,
          ease: 21.3,
          words: 28,
          sentences: 1
        },
        after: {
          grade: 9.4,
          ease: 48,
          words: 23,
          sentences: 2
        }
      }
    }
  },

  {
    draft: {
      index: 2,
      original: "In a frequently cited study, Walker and colleagues found that participants who slept for at least 7 hours after learning a list of word pairs retained roughly 20 percent more items than participants who stayed awake for the same interval.",
      plain: "In a study, Walker found people who slept 7 hours after learning word pairs remembered about 20 more words than those who stayed awake.",
      why: "Simplified 'frequently cited', 'colleagues', 'roughly', and replaced 'items' with 'words'.",
      status: "checking",
      issues: [],
      entities: [
        {
          text: "7",
          kind: "number",
          preserved: true
        },
        {
          text: "20 percent",
          kind: "number",
          preserved: false
        },
        {
          text: "Walker",
          kind: "name",
          preserved: true
        },
        {
          text: "at least",
          kind: "qualifier",
          preserved: false
        },
        {
          text: "roughly",
          kind: "qualifier",
          preserved: true,
          soft: true
        }
      ],
      reason: "",
      model: "qwen2.5:3b",
      escalated: false,
      ms: 30005,
      readability: {
        before: {
          grade: 17.4,
          ease: 41.5,
          words: 40,
          sentences: 1
        },
        after: {
          grade: 9.5,
          ease: 69.7,
          words: 24,
          sentences: 1
        }
      }
    },
    verify: {
      type: "verify",
      index: 2,
      plain: "In a study, Walker and colleagues found that people who slept for at least 7 hours after learning word pairs remembered about 20 percent more items than those who stayed awake for the same time.",
      why: "Escalated to the 7B after the draft dropped 'at least' and '20 percent'. The 7B restored both and kept the same facts.",
      status: "faithful",
      issues: [],
      entities: [
        {
          text: "7",
          kind: "number",
          preserved: true
        },
        {
          text: "20 percent",
          kind: "number",
          preserved: true
        },
        {
          text: "Walker",
          kind: "name",
          preserved: true
        },
        {
          text: "at least",
          kind: "qualifier",
          preserved: true
        },
        {
          text: "roughly",
          kind: "qualifier",
          preserved: true,
          soft: true
        }
      ],
      reason: "",
      model: "qwen2.5:7b",
      escalated: true,
      verifyMs: 24039,
      readability: {
        before: {
          grade: 17.4,
          ease: 41.5,
          words: 40,
          sentences: 1
        },
        after: {
          grade: 13.9,
          ease: 57.7,
          words: 35,
          sentences: 1
        }
      }
    }
  },

  {
    draft: {
      index: 3,
      original: "A 2019 review of 41 experiments concluded that sleep after learning improves retention in most, but not all, tested conditions, and that the evidence for sleep before learning is weaker.",
      plain: "A review in 2019 of 41 experiments found that sleep after learning helps remember things in most cases, but not always. Sleep before learning helps less well.",
      why: "Split the complex sentence into two simpler ones with the same facts",
      status: "checking",
      issues: [],
      entities: [
        {
          text: "2019",
          kind: "date",
          preserved: true
        },
        {
          text: "41",
          kind: "number",
          preserved: true
        },
        {
          text: "most, not all",
          kind: "qualifier",
          preserved: false,
          soft: true
        }
      ],
      reason: "",
      model: "qwen2.5:3b",
      escalated: false,
      ms: 20726,
      readability: {
        before: {
          grade: 13.8,
          ease: 49.5,
          words: 30,
          sentences: 1
        },
        after: {
          grade: 5.4,
          ease: 80.3,
          words: 27,
          sentences: 2
        }
      }
    },
    verify: {
      type: "verify",
      index: 3,
      plain: "A 2019 review of 41 experiments found that sleep after learning helps remember things in most cases, but not all. The evidence for sleep before learning is weaker.",
      why: "Simplified the conditions and the strength of evidence while keeping the facts exact.",
      status: "faithful",
      issues: [],
      entities: [
        {
          text: "2019",
          kind: "date",
          preserved: true
        },
        {
          text: "41",
          kind: "number",
          preserved: true
        },
        {
          text: "most, not all",
          kind: "qualifier",
          preserved: true,
          soft: true
        }
      ],
      reason: "",
      model: "qwen2.5:7b",
      escalated: true,
      verifyMs: 20990,
      readability: {
        before: {
          grade: 13.8,
          ease: 49.5,
          words: 30,
          sentences: 1
        },
        after: {
          grade: 6.3,
          ease: 74.8,
          words: 28,
          sentences: 2
        }
      }
    }
  }
];
