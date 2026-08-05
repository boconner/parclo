import { prisma } from './prisma.js'

// StoreProduct rows are the per-product source of truth; Store.onShelf and
// Store.inProcess are aggregates over them. Both directions of sync live here
// so no route touches one side without the other.

/**
 * Mirror a store-level shelf/in-process write onto the product row when the
 * brand has exactly one active product. With multiple products a bare store
 * total is ambiguous, so per-product rows are left alone and the caller's
 * store-level write stands as the aggregate.
 */
export async function syncSingleProductLevel(
  storeId: string,
  levels: { onShelf?: number; inProcess?: number },
): Promise<void> {
  if (levels.onShelf === undefined && levels.inProcess === undefined) return

  const products = await prisma.product.findMany({
    where:  { status: 'active' },
    select: { id: true },
    take:   2,
  })
  if (products.length !== 1) return

  const productId = products[0]!.id
  await prisma.storeProduct.upsert({
    where:  { storeId_productId: { storeId, productId } },
    create: { storeId, productId, onShelf: levels.onShelf ?? 0, inProcess: levels.inProcess ?? 0 },
    update: {
      ...(levels.onShelf   !== undefined ? { onShelf:   levels.onShelf }   : {}),
      ...(levels.inProcess !== undefined ? { inProcess: levels.inProcess } : {}),
    },
  })
}

/** Recompute a store's aggregate columns from its StoreProduct rows. */
export async function recomputeStoreAggregates(storeId: string): Promise<void> {
  const totals = await prisma.storeProduct.aggregate({
    where: { storeId },
    _sum:  { onShelf: true, inProcess: true },
  })
  await prisma.store.update({
    where: { id: storeId },
    data:  {
      onShelf:   totals._sum.onShelf   ?? 0,
      inProcess: totals._sum.inProcess ?? 0,
    },
  })
}
