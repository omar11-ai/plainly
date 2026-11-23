function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  let groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  let count = groups ? groups.length : 1;
  if (/(?:[^aeiou]le)$/.test(clean)) count += 1;
  return Math.max(1, count);
}

export function readability(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentenceCount = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordCount = Math.max(1, words.length);
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;
  const ease = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount);
  return {
    grade: Math.round(Math.max(1, grade) * 10) / 10,
    ease: Math.round(Math.max(0, Math.min(100, ease)) * 10) / 10,
    words: wordCount,
    sentences: sentenceCount
  };
}

export function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
