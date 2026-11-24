export interface WordToken {
  text: string;
  changed: boolean;
  start: number;
  end: number;
  isSpace: boolean;
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function tokenizeWithOffsets(input: string): Array<{ text: string; start: number; end: number; isSpace: boolean; norm: string }> {
  const tokens: Array<{ text: string; start: number; end: number; isSpace: boolean; norm: string }> = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const text = m[0];
    const isSpace = /^\s+$/.test(text);
    tokens.push({
      text,
      start: m.index,
      end: m.index + text.length,
      isSpace,
      norm: isSpace ? "" : normalizeWord(text)
    });
  }
  return tokens;
}

/**
 * Word-level LCS diff between original and plain sentences.
 * Preserves exact character offsets so Web Speech onboundary highlighting
 * can layer directly on top of diff tokens.
 */
export function computeWordDiff(original: string, plain: string): {
  origTokens: WordToken[];
  plainTokens: WordToken[];
} {
  const origAll = tokenizeWithOffsets(original);
  const plainAll = tokenizeWithOffsets(plain);

  const origWords = origAll.filter((t) => !t.isSpace);
  const plainWords = plainAll.filter((t) => !t.isSpace);

  const m = origWords.length;
  const n = plainWords.length;

  // Build DP table (sentences are short, typically < 60 words, so O(m*n) is < 0.2ms)
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origWords[i].norm && origWords[i].norm === plainWords[j].norm) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const matchedOrig = new Set<number>();
  const matchedPlain = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (origWords[i].norm && origWords[i].norm === plainWords[j].norm) {
      matchedOrig.add(i);
      matchedPlain.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  let oi = 0;
  const origTokens: WordToken[] = origAll.map((t) => {
    if (t.isSpace) return { text: t.text, changed: false, start: t.start, end: t.end, isSpace: true };
    const changed = !matchedOrig.has(oi++);
    return { text: t.text, changed, start: t.start, end: t.end, isSpace: false };
  });

  let pi = 0;
  const plainTokens: WordToken[] = plainAll.map((t) => {
    if (t.isSpace) return { text: t.text, changed: false, start: t.start, end: t.end, isSpace: true };
    const changed = !matchedPlain.has(pi++);
    return { text: t.text, changed, start: t.start, end: t.end, isSpace: false };
  });

  return { origTokens, plainTokens };
}
