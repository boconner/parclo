import { Router } from 'express'
import { prisma } from '../prisma.js'

const router = Router()

function formatContact(c: any) {
  return {
    id:         c.id,
    name:       c.name,
    role:       c.role,
    phone:      c.phone,
    email:      c.email,
    chainId:    c.chainId,
    chainName:  c.chain?.name ?? null,
    storeIds:   c.stores?.map((cs: any) => cs.storeId) ?? [],
    storeNames: c.stores?.map((cs: any) => cs.store?.name ?? '') ?? [],
    notes:      c.notes,
    createdAt:  c.createdAt.toISOString(),
  }
}

router.get('/', async (req, res) => {
  try {
    const { chainId, storeId } = req.query as Record<string, string>
    const contacts = await prisma.contact.findMany({
      where: {
        ...(chainId ? { chainId }                           : {}),
        ...(storeId ? { stores: { some: { storeId } } }    : {}),
      },
      include: {
        chain:  { select: { name: true } },
        stores: { include: { store: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(contacts.map(formatContact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where:   { id: req.params['id'] },
      include: {
        chain:  { select: { name: true } },
        stores: { include: { store: { select: { name: true } } } },
      },
    })
    if (!contact) return res.status(404).json({ error: 'Contact not found' })
    res.json(formatContact(contact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, role, phone, email, chainId, storeIds, notes } = req.body
    const contact = await prisma.contact.create({
      data: {
        name, role, phone, email, chainId, notes,
        stores: storeIds?.length
          ? { create: storeIds.map((id: string) => ({ storeId: id })) }
          : undefined,
      },
      include: {
        chain:  { select: { name: true } },
        stores: { include: { store: { select: { name: true } } } },
      },
    })
    res.status(201).json(formatContact(contact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { name, role, phone, email, chainId, notes, storeIds } = req.body
    const cid = req.params['id']

    const contact = await prisma.$transaction(async tx => {
      await tx.contact.update({
        where: { id: cid },
        data:  { name, role, phone, email, chainId, notes },
      })

      if (Array.isArray(storeIds)) {
        await tx.contactStore.deleteMany({ where: { contactId: cid } })
        if (storeIds.length > 0) {
          await tx.contactStore.createMany({
            data: storeIds.map((storeId: string) => ({ contactId: cid, storeId })),
          })
        }
      }

      return tx.contact.findUniqueOrThrow({
        where:   { id: cid },
        include: {
          chain:  { select: { name: true } },
          stores: { include: { store: { select: { name: true } } } },
        },
      })
    })

    res.json(formatContact(contact))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params['id']
    await prisma.$transaction([
      prisma.contactStore.deleteMany({ where: { contactId: id } }),
      prisma.storeVisit.updateMany({ where: { contactId: id }, data: { contactId: null } }),
      prisma.contact.delete({ where: { id } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
