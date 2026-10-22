/**
 * Server-side copy of the client's quest scoring (js/engine.js scoreQuest), shared by
 * the widget and the calendar feed so every surface shows the same rank for a quest.
 * Keep the two in step if you change how difficulty is scored.
 */

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

function scoreQuest(quest, settings) {
  if (quest.manualRank) return quest.manualRank;
  if (settings.autoRate === false) return quest.autoRank || 'C';

  const hay = `${quest.title || ''} ${quest.course || ''} ${quest.notes || ''}`.toLowerCase();
  let score = settings.baseScore ?? 2;

  const weights = settings.keywordWeights || {};
  const hits = Object.keys(weights).filter((k) => hay.includes(k)).sort((a, b) => b.length - a.length);
  const used = [];
  for (const k of hits) {
    if (used.some((u) => u.includes(k))) continue;
    used.push(k);
    score += weights[k];
    if (used.length >= 2) break;
  }

  const cw = settings.courseWeights || {};
  for (const course of Object.keys(cw)) {
    if (course && hay.includes(course.toLowerCase())) { score += cw[course]; break; }
  }
  if (/\bap\b|honors|honours|\bib\b/.test(hay)) score += 1;
  if (quest.priority >= 4) score += 1;

  return RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.round(score)))];
}

module.exports = { RANKS, scoreQuest };
