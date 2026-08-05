import 'dotenv/config'
import { prisma } from '../prisma.js'
import { runStaleAlerts } from './staleAlerts.js'

// Entry point for the scheduled stale-store alert scan (Render cron job) and for
// manual runs. Usage:
//   npm run alerts:stale              → live run (creates/resolves alerts)
//   npm run alerts:stale -- --dry-run → report only, writes nothing
const dryRun = process.argv.includes('--dry-run')

runStaleAlerts({ dryRun })
  .then(report => {
    console.log(`[stale-alerts] finished: ${JSON.stringify({
      dryRun:        report.dryRun,
      considered:    report.storesConsidered,
      visitOverdue:  `+${report.visitOverdueRaised}/-${report.visitOverdueResolved}`,
      noMovement:    `+${report.noMovementRaised}/-${report.noMovementResolved}`,
    })}`)
    for (const d of report.details) {
      console.log(`  [${d.action}] ${d.type} · ${d.storeName} · ${d.reason}`)
    }
  })
  .catch(err => {
    console.error('[stale-alerts] failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
