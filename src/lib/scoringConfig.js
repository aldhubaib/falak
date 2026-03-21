'use strict'

/**
 * Single source of truth for all scoring weights used across the platform.
 * Backend consumers import numeric values; the full object is served to the
 * frontend via GET /api/vector-intelligence/status so the UI never hardcodes
 * formula details.
 */

const RESCORE_BASE = [
  { key: 'relevance',      weight: 0.25, label: 'Relevance',        description: 'AI-predicted audience relevance' },
  { key: 'correctedViral', weight: 0.25, label: 'Viral (corrected)', description: 'Viral potential × AI accuracy multiplier' },
  { key: 'firstMover',     weight: 0.15, label: 'First Mover',      description: 'Adjusted for competitor coverage + time decay' },
  { key: 'freshness',      weight: 0.10, label: 'Freshness',        description: 'Exponential decay (half-life: 7 days)' },
]

const RESCORE_LEARNED = [
  { key: 'provenViral',  weight: 0.10, label: 'Proven Viral',  description: 'Competition video performance ratio' },
  { key: 'ownChannel',   weight: 0.05, label: 'Own Channel',   description: 'Similar own stories performance' },
  { key: 'tagSignals',   weight: 0.05, label: 'Tag Signals',   description: 'Learned tag preference weights' },
  { key: 'contentType',  weight: 0.03, label: 'Content Type',  description: 'Learned content type bias' },
  { key: 'region',       weight: 0.02, label: 'Region',        description: 'Learned regional performance' },
]

const SIMPLE_COMPOSITE = {
  relevance:  0.35,
  viral:      0.40,
  firstMover: 0.25,
}

function computeSimpleComposite(relevanceScore, viralScore, firstMoverScore) {
  const raw = relevanceScore * SIMPLE_COMPOSITE.relevance
            + viralScore * SIMPLE_COMPOSITE.viral
            + firstMoverScore * SIMPLE_COMPOSITE.firstMover
  return Math.round(raw / 10 * 10) / 10
}

/** Convert a 0–1 finalScore to a 0–10 compositeScore (1 decimal). */
function finalScoreToComposite(finalScore) {
  return Math.round(Math.max(0, Math.min(1, finalScore || 0)) * 100) / 10
}

/** Convert a 0–10 compositeScore to a 0–1 finalScore (2 decimals). */
function compositeToFinalScore(compositeScore) {
  return Math.round(Math.max(0, Math.min(10, compositeScore || 0)) * 10) / 100
}

function w(key) {
  return (RESCORE_BASE.find(r => r.key === key) || RESCORE_LEARNED.find(r => r.key === key))?.weight ?? 0
}

module.exports = {
  RESCORE_BASE,
  RESCORE_LEARNED,
  SIMPLE_COMPOSITE,
  computeSimpleComposite,
  finalScoreToComposite,
  compositeToFinalScore,
  w,
}
