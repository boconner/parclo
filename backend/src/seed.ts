import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

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
      { id: 'specs',        name: "Spec's"       },
      { id: 'goody-goody',  name: 'Goody Goody'  },
      { id: 'total-wine',   name: 'Total Wine'   },
      { id: 'twin-liquors', name: 'Twin Liquors' },
      { id: 'sigels',       name: "Sigel's"      },
    ],
    skipDuplicates: true,
  })

  // ── Reps ──────────────────────────────────────────────────────────────────
  await prisma.rep.createMany({
    data: [
      { id: 'r1',  name: 'Dana R.',   email: 'dana.r@contento.com',   marketSlug: 'dallas',      status: 'active'   },
      { id: 'r2',  name: 'Marcus T.', email: 'marcus.t@contento.com', marketSlug: 'dallas',      status: 'active'   },
      { id: 'r3',  name: 'Sofia L.',  email: 'sofia.l@contento.com',  marketSlug: 'dallas',      status: 'active'   },
      { id: 'r4',  name: 'Carlos M.', email: 'carlos.m@contento.com', marketSlug: 'houston',     status: 'active'   },
      { id: 'r5',  name: 'Priya S.',  email: 'priya.s@contento.com',  marketSlug: 'houston',     status: 'active'   },
      { id: 'r6',  name: 'Maya K.',   email: 'maya.k@contento.com',   marketSlug: 'austin',      status: 'active'   },
      { id: 'r7',  name: 'Ana G.',    email: 'ana.g@contento.com',    marketSlug: 'san-antonio', status: 'active'   },
      { id: 'r8',  name: 'Bobby L.',  email: 'bobby.l@contento.com',  marketSlug: 'east-texas',  status: 'active'   },
      { id: 'r9',  name: 'Rosa F.',   email: 'rosa.f@contento.com',   marketSlug: 'el-paso',     status: 'active'   },
      { id: 'r10', name: 'Luis V.',   email: 'luis.v@contento.com',   marketSlug: 'corpus',      status: 'active'   },
      { id: 'r11', name: 'Marta R.',  email: 'marta.r@contento.com',  marketSlug: 'brownsville', status: 'inactive' },
      { id: 'r12', name: 'Juan D.',   email: 'juan.d@contento.com',   marketSlug: 'laredo',      status: 'active'   },
    ],
    skipDuplicates: true,
  })

  // ── Stores ────────────────────────────────────────────────────────────────
  await prisma.store.createMany({
    data: [
      { id:'1',  name:'Goody Goody - Uptown',         area:'Uptown',           marketSlug:'dallas',      chainId:'goody-goody',  repId:'r1',  latitude:32.796, longitude:-96.801,  onShelf:4,  inProcess:12, daysOfSupply:3,  depletionRate:1.3, lastVisit:new Date('2026-04-22T14:00:00Z') },
      { id:'2',  name:"Spec's - Oak Lawn",             area:'Oak Lawn',         marketSlug:'dallas',      chainId:'specs',        repId:'r2',  latitude:32.810, longitude:-96.815,  onShelf:8,  inProcess:0,  daysOfSupply:6,  depletionRate:1.1, lastVisit:new Date('2026-04-21T10:00:00Z') },
      { id:'3',  name:"Sigel's - Deep Ellum",          area:'Deep Ellum',       marketSlug:'dallas',      chainId:'sigels',       repId:'r1',  latitude:32.783, longitude:-96.778,  onShelf:22, inProcess:24, daysOfSupply:18, depletionRate:1.2, lastVisit:new Date('2026-04-20T09:00:00Z') },
      { id:'4',  name:'Goody Goody - Bishop Arts',     area:'Bishop Arts',      marketSlug:'dallas',      chainId:'goody-goody',  repId:'r3',  latitude:32.746, longitude:-96.832,  onShelf:18, inProcess:0,  daysOfSupply:15, depletionRate:1.0, lastVisit:new Date('2026-04-17T11:00:00Z') },
      { id:'5',  name:'Total Wine - Lower Greenville', area:'Lower Greenville', marketSlug:'dallas',      chainId:'total-wine',   repId:'r2',  latitude:32.823, longitude:-96.775,  onShelf:5,  inProcess:12, daysOfSupply:4,  depletionRate:1.4, lastVisit:new Date('2026-04-22T13:00:00Z') },
      { id:'6',  name:"Spec's - Knox-Henderson",       area:'Knox-Henderson',   marketSlug:'dallas',      chainId:'specs',        repId:'r3',  latitude:32.828, longitude:-96.791,  onShelf:31, inProcess:0,  daysOfSupply:28, depletionRate:0.9, lastVisit:new Date('2026-04-21T08:00:00Z') },
      { id:'7',  name:"Spec's - Montrose",             area:'Montrose',         marketSlug:'houston',     chainId:'specs',        repId:'r4',  latitude:29.741, longitude:-95.390,  onShelf:6,  inProcess:0,  daysOfSupply:5,  depletionRate:1.1, lastVisit:new Date('2026-04-19T15:00:00Z') },
      { id:'8',  name:'Total Wine - The Heights',      area:'The Heights',      marketSlug:'houston',     chainId:'total-wine',   repId:'r5',  latitude:29.790, longitude:-95.398,  onShelf:24, inProcess:12, daysOfSupply:20, depletionRate:1.0, lastVisit:new Date('2026-04-22T09:00:00Z') },
      { id:'9',  name:'Goody Goody - River Oaks',      area:'River Oaks',       marketSlug:'houston',     chainId:'goody-goody',  repId:'r4',  latitude:29.739, longitude:-95.431,  onShelf:11, inProcess:0,  daysOfSupply:9,  depletionRate:1.0, lastVisit:new Date('2026-04-21T10:00:00Z') },
      { id:'10', name:'Twin Liquors - South Congress',  area:'South Congress',   marketSlug:'austin',      chainId:'twin-liquors', repId:'r6',  latitude:30.246, longitude:-97.750,  onShelf:28, inProcess:0,  daysOfSupply:23, depletionRate:1.1, lastVisit:new Date('2026-04-22T10:00:00Z') },
      { id:'11', name:'Twin Liquors - East 6th',        area:'East 6th',         marketSlug:'austin',      chainId:'twin-liquors', repId:'r6',  latitude:30.261, longitude:-97.723,  onShelf:7,  inProcess:0,  daysOfSupply:6,  depletionRate:1.0, lastVisit:new Date('2026-04-19T11:00:00Z') },
      { id:'12', name:"Spec's - Pearl District",        area:'Pearl District',   marketSlug:'san-antonio', chainId:'specs',        repId:'r7',  latitude:29.438, longitude:-98.469,  onShelf:16, inProcess:0,  daysOfSupply:14, depletionRate:1.0, lastVisit:new Date('2026-04-21T09:00:00Z') },
      { id:'13', name:'Total Wine - Alamo Heights',     area:'Alamo Heights',    marketSlug:'san-antonio', chainId:'total-wine',   repId:'r7',  latitude:29.487, longitude:-98.461,  onShelf:5,  inProcess:12, daysOfSupply:4,  depletionRate:1.3, lastVisit:new Date('2026-04-17T14:00:00Z') },
      { id:'14', name:'Goody Goody - Tyler',            area:'Tyler',            marketSlug:'east-texas',  chainId:'goody-goody',  repId:'r8',  latitude:32.351, longitude:-95.301,  onShelf:18, inProcess:0,  daysOfSupply:15, depletionRate:1.0, lastVisit:new Date('2026-04-22T08:00:00Z') },
      { id:'15', name:'Total Wine - El Paso',           area:'Downtown EP',      marketSlug:'el-paso',     chainId:'total-wine',   repId:'r9',  latitude:31.758, longitude:-106.487, onShelf:20, inProcess:0,  daysOfSupply:18, depletionRate:1.0, lastVisit:new Date('2026-04-21T09:00:00Z') },
      { id:'16', name:"Spec's - Corpus Christi",        area:'Downtown CC',      marketSlug:'corpus',      chainId:'specs',        repId:'r10', latitude:27.800, longitude:-97.396,  onShelf:14, inProcess:0,  daysOfSupply:12, depletionRate:1.0, lastVisit:new Date('2026-04-20T10:00:00Z') },
      { id:'17', name:"Spec's - Brownsville",           area:'Downtown BV',      marketSlug:'brownsville', chainId:'specs',        repId:'r11', latitude:25.902, longitude:-97.497,  onShelf:17, inProcess:0,  daysOfSupply:14, depletionRate:1.0, lastVisit:new Date('2026-04-22T08:00:00Z') },
      { id:'18', name:'Total Wine - Laredo',            area:'Downtown LR',      marketSlug:'laredo',      chainId:'total-wine',   repId:'r12', latitude:27.506, longitude:-99.507,  onShelf:22, inProcess:12, daysOfSupply:19, depletionRate:1.0, lastVisit:new Date('2026-04-21T09:00:00Z') },
    ],
    skipDuplicates: true,
  })

  // ── Contacts ──────────────────────────────────────────────────────────────
  const contacts = [
    { id:'c1',  name:'Jennifer Walsh', role:'Regional Buyer',    phone:'214-555-0101', email:'j.walsh@specs.com',       chainId:'specs',        notes:"Primary buyer for all Spec's locations. Prefers email first.", storeIds: [] as string[] },
    { id:'c2',  name:'Tom Bradley',    role:'Category Manager',  phone:'214-555-0102', email:'t.bradley@specs.com',     chainId:'specs',        notes:'Handles spirits category across all markets.',                  storeIds: [] as string[] },
    { id:'c3',  name:'Rachel Kim',     role:'VP of Purchasing',  phone:'972-555-0201', email:'r.kim@goodygoody.com',    chainId:'goody-goody',  notes:'Key decision-maker for new listings.',                          storeIds: [] as string[] },
    { id:'c4',  name:'Derek Nguyen',   role:'District Manager',  phone:'469-555-0301', email:'d.nguyen@totalwine.com',  chainId:'total-wine',   notes:'Oversees TX region stores.',                                    storeIds: [] as string[] },
    { id:'c5',  name:'Sandra Ortiz',   role:'Store Manager',     phone:'214-555-1001', email:'s.ortiz@goodygoody.com',  chainId:'goody-goody',  notes:'Very responsive. Best to call in the morning.',                  storeIds: ['1'] },
    { id:'c6',  name:'Mike Torres',    role:'Store Manager',     phone:'214-555-1002', email:'m.torres@specs.com',      chainId:'specs',        notes:'',                                                               storeIds: ['2'] },
    { id:'c7',  name:'Carla Vega',     role:'Spirits Lead',      phone:'214-555-1003', email:'c.vega@specs.com',        chainId:'specs',        notes:'Covers both Oak Lawn and Knox-Henderson.',                       storeIds: ['2','6'] },
    { id:'c8',  name:'James Park',     role:'Store Manager',     phone:'214-555-1004', email:'j.park@totalwine.com',    chainId:'total-wine',   notes:'',                                                               storeIds: ['5'] },
    { id:'c9',  name:'Lupe Hernandez', role:'Spirits Buyer',     phone:'713-555-2001', email:'l.hernandez@specs.com',   chainId:'specs',        notes:'Strong champion for craft spirits.',                             storeIds: ['7'] },
    { id:'c10', name:'Nina Patel',     role:'Assistant Manager', phone:'512-555-3001', email:'n.patel@twinliquors.com', chainId:'twin-liquors', notes:'',                                                               storeIds: ['10','11'] },
    { id:'c11', name:'Greg Salinas',   role:'Store Manager',     phone:'210-555-4001', email:'g.salinas@totalwine.com', chainId:'total-wine',   notes:'Good relationship. Willing to do end-caps.',                     storeIds: ['13'] },
    { id:'c12', name:'Hailey Brooks',  role:'Floor Lead',        phone:'903-555-5001', email:'h.brooks@goodygoody.com', chainId:'goody-goody',  notes:'',                                                               storeIds: ['14'] },
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
      { id: 'p1', name: 'Sangria Vibes', sku: '73898', sizeLabel: '750ml', unitsPerCase: 6 },
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
      { id:'a1', type:'LOW_STOCK_REP',    status:'OPEN', message:'3 days of supply · 12 bottles in transit',        storeId:'1',  triggeredAt:new Date('2026-04-22T14:00:00Z') },
      { id:'a2', type:'LOW_STOCK_REP',    status:'OPEN', message:'4 days of supply · No open order',                storeId:'5',  triggeredAt:new Date('2026-04-22T13:00:00Z') },
      { id:'a3', type:'LOW_STOCK_REP',    status:'OPEN', message:'6 days of supply · Needs order placed',           storeId:'2',  triggeredAt:new Date('2026-04-21T10:00:00Z') },
      { id:'a4', type:'LOW_STOCK_REP',    status:'OPEN', message:'5 days of supply · No open order',                storeId:'7',  triggeredAt:new Date('2026-04-19T15:00:00Z') },
      { id:'a5', type:'LOW_STOCK_REP',    status:'OPEN', message:'9 days of supply · Consider ordering',            storeId:'9',  triggeredAt:new Date('2026-04-21T10:00:00Z') },
      { id:'a6', type:'LOW_STOCK_REP',    status:'OPEN', message:'6 days of supply · Needs order placed',           storeId:'11', triggeredAt:new Date('2026-04-19T11:00:00Z') },
      { id:'a7', type:'LOW_STOCK_REP',    status:'OPEN', message:'4 days of supply · 12 bottles in transit',        storeId:'13', triggeredAt:new Date('2026-04-17T14:00:00Z') },
      { id:'a8', type:'REORDER_SUPPLIER', status:'OPEN', message:'At current velocity, stock depletes in ~22 days', storeId:null, triggeredAt:new Date('2026-04-22T08:00:00Z') },
    ],
    skipDuplicates: true,
  })

  console.log('Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
