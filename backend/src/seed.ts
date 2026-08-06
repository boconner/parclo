import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Demo dates were authored against an anchor "today" of 2026-04-23 and are
// shifted to the real current date at seed time, so a fresh demo always looks
// freshly used — the busiest day is always "yesterday", never months ago.
const ANCHOR = new Date('2026-04-23T00:00:00Z').getTime()
const SHIFT  = Date.now() - ANCHOR
const d = (iso: string) => new Date(new Date(iso).getTime() + SHIFT)
/** n days in the future (negative = past), at the given UTC hour. */
const inDays = (n: number, hour = 17) => {
  const t = new Date(Date.now() + n * 86_400_000)
  t.setUTCHours(hour, 0, 0, 0)
  return t
}

/** Matches OrgSettings.brandName's schema default — i.e. "never configured". */
const DEFAULT_BRAND_NAME = 'Parclo'

/** Host and database name of the target, with credentials stripped. */
function targetDescription(): string {
  const url = process.env.DATABASE_URL
  if (!url) return 'UNKNOWN (DATABASE_URL is not set)'
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return 'UNKNOWN (DATABASE_URL is not a valid URL)'
  }
}

async function main() {
  // This script writes demo data. Say out loud where it is about to write, so a
  // stale DATABASE_URL in .env can't quietly load fake stores into a real
  // customer's database.
  console.log(`Seeding ${targetDescription()} ...`)

  // ── Markets ───────────────────────────────────────────────────────────────
  await prisma.market.createMany({
    data: [
      { slug: 'dallas',      name: 'Dallas'         },
      { slug: 'houston',     name: 'Houston'        },
      { slug: 'san-antonio', name: 'San Antonio'    },
      { slug: 'austin',      name: 'Austin'         },
      { slug: 'east-texas',  name: 'East Texas'     },
      { slug: 'el-paso',     name: 'El Paso'        },
      { slug: 'corpus',      name: 'Corpus Christi' },
      { slug: 'brownsville', name: 'Brownsville'    },
      { slug: 'laredo',      name: 'Laredo'         },
    ],
    skipDuplicates: true,
  })

  // ── Chains ────────────────────────────────────────────────────────────────
  await prisma.chain.createMany({
    data: [
      { id: 'city-cellars',        name: "City Cellars"       },
      { id: 'vine-valley',  name: 'Vine Valley'  },
      { id: 'bottle-barn',   name: 'Bottle Barn'   },
      { id: 'copper-cork', name: 'Copper Cork' },
      { id: 'harbor-spirits',       name: "Harbor Spirits"      },
    ],
    skipDuplicates: true,
  })

  // ── Reps ──────────────────────────────────────────────────────────────────
  await prisma.rep.createMany({
    data: [
      { id: 'r1',  name: 'Dana R.',   email: 'dana.r@example.com',   marketSlug: 'dallas',      status: 'active'   },
      { id: 'r2',  name: 'Marcus T.', email: 'marcus.t@example.com', marketSlug: 'dallas',      status: 'active'   },
      { id: 'r3',  name: 'Sofia L.',  email: 'sofia.l@example.com',  marketSlug: 'dallas',      status: 'active'   },
      { id: 'r4',  name: 'Carlos M.', email: 'carlos.m@example.com', marketSlug: 'houston',     status: 'active'   },
      { id: 'r5',  name: 'Priya S.',  email: 'priya.s@example.com',  marketSlug: 'houston',     status: 'active'   },
      { id: 'r6',  name: 'Maya K.',   email: 'maya.k@example.com',   marketSlug: 'austin',      status: 'active'   },
      { id: 'r7',  name: 'Ana G.',    email: 'ana.g@example.com',    marketSlug: 'san-antonio', status: 'active'   },
      { id: 'r8',  name: 'Bobby L.',  email: 'bobby.l@example.com',  marketSlug: 'east-texas',  status: 'active'   },
      { id: 'r9',  name: 'Rosa F.',   email: 'rosa.f@example.com',   marketSlug: 'el-paso',     status: 'active'   },
      { id: 'r10', name: 'Luis V.',   email: 'luis.v@example.com',   marketSlug: 'corpus',      status: 'active'   },
      { id: 'r11', name: 'Marta R.',  email: 'marta.r@example.com',  marketSlug: 'brownsville', status: 'inactive' },
      { id: 'r12', name: 'Juan D.',   email: 'juan.d@example.com',   marketSlug: 'laredo',      status: 'active'   },
    ],
    skipDuplicates: true,
  })

  // ── Stores ────────────────────────────────────────────────────────────────
  await prisma.store.createMany({
    data: [
      { id:'1',  name:'Vine Valley - Uptown',         area:'Uptown',           marketSlug:'dallas',      chainId:'vine-valley',  repId:'r1',  latitude:32.796, longitude:-96.801,  onShelf:4,  inProcess:12, daysOfSupply:3,  depletionRate:1.3, lastVisit:d('2026-04-22T14:00:00Z') },
      { id:'2',  name:"City Cellars - Oak Lawn",             area:'Oak Lawn',         marketSlug:'dallas',      chainId:'city-cellars',        repId:'r2',  latitude:32.810, longitude:-96.815,  onShelf:8,  inProcess:0,  daysOfSupply:6,  depletionRate:1.1, lastVisit:d('2026-04-21T10:00:00Z') },
      { id:'3',  name:"Harbor Spirits - Deep Ellum",          area:'Deep Ellum',       marketSlug:'dallas',      chainId:'harbor-spirits',       repId:'r1',  latitude:32.783, longitude:-96.778,  onShelf:22, inProcess:24, daysOfSupply:18, depletionRate:1.2, lastVisit:d('2026-04-20T09:00:00Z') },
      { id:'4',  name:'Vine Valley - Bishop Arts',     area:'Bishop Arts',      marketSlug:'dallas',      chainId:'vine-valley',  repId:'r3',  latitude:32.746, longitude:-96.832,  onShelf:18, inProcess:0,  daysOfSupply:15, depletionRate:1.0, lastVisit:d('2026-04-17T11:00:00Z') },
      { id:'5',  name:'Bottle Barn - Lower Greenville', area:'Lower Greenville', marketSlug:'dallas',      chainId:'bottle-barn',   repId:'r2',  latitude:32.823, longitude:-96.775,  onShelf:5,  inProcess:12, daysOfSupply:4,  depletionRate:1.4, lastVisit:d('2026-04-22T13:00:00Z') },
      { id:'6',  name:"City Cellars - Knox-Henderson",       area:'Knox-Henderson',   marketSlug:'dallas',      chainId:'city-cellars',        repId:'r3',  latitude:32.828, longitude:-96.791,  onShelf:31, inProcess:0,  daysOfSupply:28, depletionRate:0.9, lastVisit:d('2026-04-21T08:00:00Z') },
      { id:'7',  name:"City Cellars - Montrose",             area:'Montrose',         marketSlug:'houston',     chainId:'city-cellars',        repId:'r4',  latitude:29.741, longitude:-95.390,  onShelf:6,  inProcess:0,  daysOfSupply:5,  depletionRate:1.1, lastVisit:d('2026-04-19T15:00:00Z') },
      { id:'8',  name:'Bottle Barn - The Heights',      area:'The Heights',      marketSlug:'houston',     chainId:'bottle-barn',   repId:'r5',  latitude:29.790, longitude:-95.398,  onShelf:24, inProcess:12, daysOfSupply:20, depletionRate:1.0, lastVisit:d('2026-04-22T09:00:00Z') },
      { id:'9',  name:'Vine Valley - River Oaks',      area:'River Oaks',       marketSlug:'houston',     chainId:'vine-valley',  repId:'r4',  latitude:29.739, longitude:-95.431,  onShelf:11, inProcess:0,  daysOfSupply:9,  depletionRate:1.0, lastVisit:d('2026-04-21T10:00:00Z') },
      { id:'10', name:'Copper Cork - South Congress',  area:'South Congress',   marketSlug:'austin',      chainId:'copper-cork', repId:'r6',  latitude:30.246, longitude:-97.750,  onShelf:28, inProcess:0,  daysOfSupply:23, depletionRate:1.1, lastVisit:d('2026-04-22T10:00:00Z') },
      { id:'11', name:'Copper Cork - East 6th',        area:'East 6th',         marketSlug:'austin',      chainId:'copper-cork', repId:'r6',  latitude:30.261, longitude:-97.723,  onShelf:7,  inProcess:0,  daysOfSupply:6,  depletionRate:1.0, lastVisit:d('2026-04-19T11:00:00Z') },
      { id:'12', name:"City Cellars - Pearl District",        area:'Pearl District',   marketSlug:'san-antonio', chainId:'city-cellars',        repId:'r7',  latitude:29.438, longitude:-98.469,  onShelf:16, inProcess:0,  daysOfSupply:14, depletionRate:1.0, lastVisit:d('2026-04-21T09:00:00Z') },
      { id:'13', name:'Bottle Barn - Alamo Heights',     area:'Alamo Heights',    marketSlug:'san-antonio', chainId:'bottle-barn',   repId:'r7',  latitude:29.487, longitude:-98.461,  onShelf:5,  inProcess:12, daysOfSupply:4,  depletionRate:1.3, lastVisit:d('2026-04-17T14:00:00Z') },
      { id:'14', name:'Vine Valley - Tyler',            area:'Tyler',            marketSlug:'east-texas',  chainId:'vine-valley',  repId:'r8',  latitude:32.351, longitude:-95.301,  onShelf:18, inProcess:0,  daysOfSupply:15, depletionRate:1.0, lastVisit:d('2026-04-22T08:00:00Z') },
      { id:'15', name:'Bottle Barn - El Paso',           area:'Downtown EP',      marketSlug:'el-paso',     chainId:'bottle-barn',   repId:'r9',  latitude:31.758, longitude:-106.487, onShelf:20, inProcess:0,  daysOfSupply:18, depletionRate:1.0, lastVisit:d('2026-04-21T09:00:00Z') },
      { id:'16', name:"City Cellars - Corpus Christi",        area:'Downtown CC',      marketSlug:'corpus',      chainId:'city-cellars',        repId:'r10', latitude:27.800, longitude:-97.396,  onShelf:14, inProcess:0,  daysOfSupply:12, depletionRate:1.0, lastVisit:d('2026-04-20T10:00:00Z') },
      { id:'17', name:"City Cellars - Brownsville",           area:'Downtown BV',      marketSlug:'brownsville', chainId:'city-cellars',        repId:'r11', latitude:25.902, longitude:-97.497,  onShelf:17, inProcess:0,  daysOfSupply:14, depletionRate:1.0, lastVisit:d('2026-04-22T08:00:00Z') },
      { id:'18', name:'Bottle Barn - Laredo',            area:'Downtown LR',      marketSlug:'laredo',      chainId:'bottle-barn',   repId:'r12', latitude:27.506, longitude:-99.507,  onShelf:22, inProcess:12, daysOfSupply:19, depletionRate:1.0, lastVisit:d('2026-04-21T09:00:00Z') },
    ],
    skipDuplicates: true,
  })

  // ── Contacts ──────────────────────────────────────────────────────────────
  const contacts = [
    { id:'c1',  name:'Jennifer Walsh', role:'Regional Buyer',    phone:'214-555-0101', email:'j.walsh@citycellars.example.com',       chainId:'city-cellars',        notes:"Primary buyer for all City Cellars locations. Prefers email first.", storeIds: [] as string[] },
    { id:'c2',  name:'Tom Bradley',    role:'Category Manager',  phone:'214-555-0102', email:'t.bradley@citycellars.example.com',     chainId:'city-cellars',        notes:'Handles spirits category across all markets.',                  storeIds: [] as string[] },
    { id:'c3',  name:'Rachel Kim',     role:'VP of Purchasing',  phone:'972-555-0201', email:'r.kim@vinevalley.example.com',    chainId:'vine-valley',  notes:'Key decision-maker for new listings.',                          storeIds: [] as string[] },
    { id:'c4',  name:'Derek Nguyen',   role:'District Manager',  phone:'469-555-0301', email:'d.nguyen@bottlebarn.example.com',  chainId:'bottle-barn',   notes:'Oversees TX region stores.',                                    storeIds: [] as string[] },
    { id:'c5',  name:'Sandra Ortiz',   role:'Store Manager',     phone:'214-555-1001', email:'s.ortiz@vinevalley.example.com',  chainId:'vine-valley',  notes:'Very responsive. Best to call in the morning.',                  storeIds: ['1'] },
    { id:'c6',  name:'Mike Torres',    role:'Store Manager',     phone:'214-555-1002', email:'m.torres@citycellars.example.com',      chainId:'city-cellars',        notes:'',                                                               storeIds: ['2'] },
    { id:'c7',  name:'Carla Vega',     role:'Spirits Lead',      phone:'214-555-1003', email:'c.vega@citycellars.example.com',        chainId:'city-cellars',        notes:'Covers both Oak Lawn and Knox-Henderson.',                       storeIds: ['2','6'] },
    { id:'c8',  name:'James Park',     role:'Store Manager',     phone:'214-555-1004', email:'j.park@bottlebarn.example.com',    chainId:'bottle-barn',   notes:'',                                                               storeIds: ['5'] },
    { id:'c9',  name:'Lupe Hernandez', role:'Spirits Buyer',     phone:'713-555-2001', email:'l.hernandez@citycellars.example.com',   chainId:'city-cellars',        notes:'Strong champion for craft spirits.',                             storeIds: ['7'] },
    { id:'c10', name:'Nina Patel',     role:'Assistant Manager', phone:'512-555-3001', email:'n.patel@coppercork.example.com', chainId:'copper-cork', notes:'',                                                               storeIds: ['10','11'] },
    { id:'c11', name:'Greg Salinas',   role:'Store Manager',     phone:'210-555-4001', email:'g.salinas@bottlebarn.example.com', chainId:'bottle-barn',   notes:'Good relationship. Willing to do end-caps.',                     storeIds: ['13'] },
    { id:'c12', name:'Hailey Brooks',  role:'Floor Lead',        phone:'903-555-5001', email:'h.brooks@vinevalley.example.com', chainId:'vine-valley',  notes:'',                                                               storeIds: ['14'] },
  ]

  for (const c of contacts) {
    await prisma.contact.upsert({
      where:  { id: c.id },
      update: {},
      create: {
        id: c.id, name: c.name, role: c.role, phone: c.phone,
        email: c.email, chainId: c.chainId, notes: c.notes,
        stores: c.storeIds.length
          ? { create: c.storeIds.map(sid => ({ storeId: sid })) }
          : undefined,
      },
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────
  // One product: the seed data's shelf counts describe a single SKU, so the
  // single-product collapse applies and StoreProduct rows mirror Store.onShelf.
  await prisma.product.createMany({
    data: [
      { id: 'p1', name: 'Flagship', sku: '10001', sizeLabel: '750ml', unitsPerCase: 6 },
    ],
    skipDuplicates: true,
  })
  const seededStores = await prisma.store.findMany({ select: { id: true, onShelf: true, inProcess: true } })
  await prisma.storeProduct.createMany({
    data: seededStores.map(s => ({ storeId: s.id, productId: 'p1', onShelf: s.onShelf, inProcess: s.inProcess })),
    skipDuplicates: true,
  })

  // ── Alerts ────────────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    data: [
      { id:'a1', type:'LOW_STOCK_REP',    status:'OPEN', message:'3 days of supply · 12 bottles in transit',        storeId:'1',  triggeredAt:d('2026-04-22T14:00:00Z') },
      { id:'a2', type:'LOW_STOCK_REP',    status:'OPEN', message:'4 days of supply · No open order',                storeId:'5',  triggeredAt:d('2026-04-22T13:00:00Z') },
      { id:'a3', type:'LOW_STOCK_REP',    status:'OPEN', message:'6 days of supply · Needs order placed',           storeId:'2',  triggeredAt:d('2026-04-21T10:00:00Z') },
      { id:'a4', type:'LOW_STOCK_REP',    status:'OPEN', message:'5 days of supply · No open order',                storeId:'7',  triggeredAt:d('2026-04-19T15:00:00Z') },
      { id:'a5', type:'LOW_STOCK_REP',    status:'OPEN', message:'9 days of supply · Consider ordering',            storeId:'9',  triggeredAt:d('2026-04-21T10:00:00Z') },
      { id:'a6', type:'LOW_STOCK_REP',    status:'OPEN', message:'6 days of supply · Needs order placed',           storeId:'11', triggeredAt:d('2026-04-19T11:00:00Z') },
      { id:'a7', type:'LOW_STOCK_REP',    status:'OPEN', message:'4 days of supply · 12 bottles in transit',        storeId:'13', triggeredAt:d('2026-04-17T14:00:00Z') },
      { id:'a8', type:'REORDER_SUPPLIER', status:'OPEN', message:'At current velocity, stock depletes in ~22 days', storeId:null, triggeredAt:d('2026-04-22T08:00:00Z') },
    ],
    skipDuplicates: true,
  })

  // ── Visit history ─────────────────────────────────────────────────────────
  // A few weeks of back-story per store so the activity feed, trend charts,
  // and store timelines have something to show. Sawtooth shelf counts (stock
  // up, deplete, stock up) walking back from each store's current state.
  const seededVisitStores = await prisma.store.findMany({
    where:  { lastVisit: { not: null } },
    select: { id: true, repId: true, onShelf: true, lastVisit: true },
  })
  const VISIT_ACTIONS = ['checked', 'stocked', 'checked', 'order_placed'] as const
  const VISIT_NOTES: (string | null)[] = [
    null,
    'Moved to an end-cap by the registers.',
    null,
    'Manager asked about case pricing for next month.',
    null,
    'Shelf tag was missing — replaced it.',
  ]
  const visitRows = seededVisitStores.flatMap(s => {
    const n = Number(s.id)
    return Array.from({ length: 4 }, (_, i) => {
      // Older visits alternate between "just restocked" and "run down" levels.
      const bump  = i === 0 ? 0 : i % 2 === 1 ? 6 + (n % 5) : 2 + (n % 3)
      const hours = 9 + ((n + i) % 8)
      return {
        id:        `v${s.id}-${i}`,
        storeId:   s.id,
        repId:     s.repId!,
        onShelf:   Math.max(0, s.onShelf + bump),
        action:    VISIT_ACTIONS[(n + i) % VISIT_ACTIONS.length],
        notes:     VISIT_NOTES[(n + i) % VISIT_NOTES.length],
        // Depletion since the previous visit — this is what the dashboard's
        // Weekly Depletion chart is built from, so every visit records one.
        bottlesSold: 3 + ((n * 3 + i * 5) % 9),
        visitedAt: new Date(s.lastVisit!.getTime() - i * (6 + (n % 3)) * 86_400_000 + hours * 3_600_000),
      }
    })
  })
  await prisma.storeVisit.createMany({ data: visitRows, skipDuplicates: true })

  // ── Store orders ──────────────────────────────────────────────────────────
  // Cases placed over the past two months. Pairs with visit depletion on the
  // Weekly Depletion chart (sold vs. ordered) and fills Order History tabs.
  const orderStores = seededVisitStores.filter((_, i) => i % 2 === 0)
  await prisma.storeOrder.createMany({
    data: orderStores.flatMap((s, idx) => {
      const n = Number(s.id)
      return [0, 1, 2].map(k => {
        const daysBack = 5 + k * 17 + (n % 6)
        return {
          id:         `o${s.id}-${k}`,
          storeId:    s.id,
          quantity:   6 * (1 + ((n + k) % 3)),
          placedAt:   inDays(-daysBack, 15),
          status:     (k === 0 ? 'pending' : k === 1 ? 'in_transit' : 'delivered') as 'pending' | 'in_transit' | 'delivered',
          invoiceRef: `SO-${1200 + idx * 3 + k}`,
        }
      })
    }),
    skipDuplicates: true,
  })

  // ── Events ────────────────────────────────────────────────────────────────
  // Two tastings on the calendar, two recently completed with results.
  const events = [
    { id:'e1', type:'tasting' as const, status:'scheduled' as const, storeId:'1',  title:null, scheduledAt:inDays(2, 22),  notes:'Friday evening tasting — high foot traffic.', repIds:['r1'] },
    { id:'e2', type:'tasting' as const, status:'scheduled' as const, storeId:'8',  title:null, scheduledAt:inDays(6, 23),  notes:null, repIds:['r5'] },
    { id:'e3', type:'tasting' as const, status:'completed' as const, storeId:'10', title:null, scheduledAt:inDays(-4, 23), notes:null, bottlesSold:14, hoursWorked:3,   completionNotes:'Strong turnout; sold through the demo case.', repIds:['r6'] },
    { id:'e4', type:'private_event' as const, status:'completed' as const, storeId:null, title:'Trade night — Dallas distributors', scheduledAt:inDays(-9, 0), notes:null, bottlesSold:22, hoursWorked:4.5, completionNotes:'Two chains asked for follow-up meetings.', repIds:['r1','r2'] },
  ]
  for (const e of events) {
    await prisma.event.upsert({
      where:  { id: e.id },
      update: {},
      create: {
        id: e.id, type: e.type, status: e.status, title: e.title,
        storeId: e.storeId, scheduledAt: e.scheduledAt, notes: e.notes,
        bottlesSold: 'bottlesSold' in e ? e.bottlesSold : null,
        hoursWorked: 'hoursWorked' in e ? e.hoursWorked : null,
        completionNotes: 'completionNotes' in e ? e.completionNotes : null,
        reps: { create: e.repIds.map(repId => ({ repId })) },
      },
    })
  }

  // ── Demo branding ─────────────────────────────────────────────────────────
  // A fictional brand so the demo shows the white-label story, not the Parclo
  // defaults. Applied when the row is missing OR still untouched — reading
  // /api/brand creates a default row, so create-only would silently skip on any
  // instance that had been opened once. Real branding is never overwritten.
  const demoBrand = {
    brandName:    'Solstice Spirits',
    primaryColor: '#0f766e',
    supportEmail: 'hello@solstice.example.com',
  }
  const existingSettings = await prisma.orgSettings.findUnique({ where: { id: 'default' } })
  const untouched = !existingSettings
    || (existingSettings.brandName === DEFAULT_BRAND_NAME && existingSettings.logoUrl === null)
  if (untouched) {
    await prisma.orgSettings.upsert({
      where:  { id: 'default' },
      update: demoBrand,
      create: { id: 'default', ...demoBrand },
    })
  } else {
    console.log(`Kept existing branding "${existingSettings!.brandName}".`)
  }

  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
