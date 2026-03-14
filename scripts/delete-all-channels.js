/**
 * One-off script: delete ALL channels from the DB.
 * Cascades will remove related videos, snapshots, pipeline items, etc.
 * Usage: from repo root, with DATABASE_URL in .env (or set for Railway):
 *   node scripts/delete-all-channels.js
 */
try { require('dotenv').config() } catch (_) {}

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const count = await db.channel.count()
  if (count === 0) {
    console.log('DB already has 0 channels. Nothing to delete.')
    return
  }
  await db.channel.deleteMany({})
  console.log(`Deleted ${count} channel(s). DB now has 0 channels.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
