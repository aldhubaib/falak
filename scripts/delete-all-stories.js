/**
 * One-off script: wipe all stories, articles, and AI intelligence data.
 * Keeps projects, channels, videos, and article sources intact.
 *
 * Deletes: Story, StoryLog, Article, ApifyRun, Alert, ScoreProfile
 * Resets:  ArticleSource polling state (lastPolledAt, fetchLog, lastImportedRunId)
 *
 * Usage:  node scripts/delete-all-stories.js
 */
try { require('dotenv').config() } catch (_) {}

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const [storyCount, articleCount, alertCount, profileCount] = await Promise.all([
    db.story.count(),
    db.article.count(),
    db.alert.count(),
    db.scoreProfile.count(),
  ])

  if (storyCount + articleCount + alertCount + profileCount === 0) {
    console.log('Nothing to delete — all tables are already empty.')
    return
  }

  console.log(`Found: ${storyCount} stories, ${articleCount} articles, ${alertCount} alerts, ${profileCount} score profiles`)
  console.log('Deleting…')

  // Order matters: children first, then parents
  const results = await db.$transaction([
    db.storyLog.deleteMany({}),
    db.alert.deleteMany({}),
    db.article.deleteMany({}),
    db.apifyRun.deleteMany({}),
    db.story.deleteMany({}),
    db.scoreProfile.deleteMany({}),
  ])

  const labels = ['StoryLog', 'Alert', 'Article', 'ApifyRun', 'Story', 'ScoreProfile']
  results.forEach((r, i) => console.log(`  ${labels[i]}: ${r.count} deleted`))

  // Reset article source polling state so they're fresh for re-import
  const sourceReset = await db.articleSource.updateMany({
    data: { lastPolledAt: null, fetchLog: null, lastImportedRunId: null },
  })
  console.log(`  ArticleSource: ${sourceReset.count} reset`)

  console.log('Done — all story & article pipeline data cleared.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
