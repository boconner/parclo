// One-time backfill for the Product migration: creates a default product (if
// none exists) and copies each store's aggregate onShelf/inProcess into a
// StoreProduct row for it. Idempotent — existing StoreProduct rows are left
// alone. Run with:
//   npx tsx scripts/backfill-products.ts "Product Name"
import { prisma } from '../src/prisma.js'

async function main() {
  const name = process.argv[2]?.trim() || 'Primary Product'

  let product = await prisma.product.findFirst({ where: { status: 'active' } })
  if (!product) {
    product = await prisma.product.create({ data: { name } })
    console.log(`Created product "${product.name}" (${product.id})`)
  } else {
    console.log(`Using existing product "${product.name}" (${product.id})`)
  }

  const stores = await prisma.store.findMany({
    select: { id: true, name: true, onShelf: true, inProcess: true },
  })

  let created = 0
  for (const s of stores) {
    const existing = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId: s.id, productId: product.id } },
    })
    if (existing) continue
    await prisma.storeProduct.create({
      data: { storeId: s.id, productId: product.id, onShelf: s.onShelf, inProcess: s.inProcess },
    })
    created++
  }

  console.log(`Backfilled ${created} of ${stores.length} store(s)`)
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
