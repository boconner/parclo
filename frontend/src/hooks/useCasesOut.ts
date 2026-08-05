import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { InventorySnapshot } from '@/types'

export const BOTTLES_PER_CASE = 6

const EMPTY: InventorySnapshot = {
  totalCasesMade:             0,
  totalTransferred:           0,
  casesInWarehouse:           0,
  onHandCases:                0,
  onHandBottles:              0,
  casesDeployed:              0,
  bottlesDeployed:            0,
  bottlesOnShelf:             0,
  bottlesDepleted:            0,
  casesDepleted:              0,
  casesOnShelf:               0,
  eventSalesBottles:          0,
  eventSalesCases:            0,
  casesSold:                  0,
  bottlesSold:                0,
  sellThroughPct:             0,
  depletionRateBottlesPerDay: 0,
  depletionRateWeeklyCases:   0,
  warehouseWeeksLeft:         null,
  reorderDate:                null,
  recommendedOrderCases:      null,
  reorderAlert:               false,
  reorderLeadWeeks:           12,
  bufferWeeks:                8,
  markets:                    [],
  chains:                     [],
  storeDeliveries:            [],
  repDeliveries:              [],
}

export function useInventory() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:   ['inventory'],
    queryFn:    api.getInventory,
    staleTime:  60_000,
    retry:      3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })

  const inv = data ?? EMPTY

  const addProductionRun = useMutation({
    mutationFn: api.addProductionRun,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  const addDeployment = useMutation({
    mutationFn: api.addDeployment,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  const updateSettings = useMutation({
    mutationFn: api.updateInventorySettings,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })

  const addSalesEntry = useMutation({
    mutationFn: api.addSalesEntry,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-log'] })
    },
  })

  return {
    ...inv,
    isLoading,
    addProductionRun: addProductionRun.mutate,
    addDeployment:    addDeployment.mutate,
    updateSettings:   updateSettings.mutate,
    addSalesEntry:    addSalesEntry.mutate,
    isPending:        addProductionRun.isPending || addDeployment.isPending || updateSettings.isPending || addSalesEntry.isPending,
  }
}

