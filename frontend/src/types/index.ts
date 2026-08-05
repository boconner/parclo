export type AlertType   = 'LOW_STOCK_REP' | 'REORDER_SUPPLIER' | 'VISIT_OVERDUE' | 'NO_MOVEMENT'
export type AlertStatus = 'OPEN' | 'RESOLVED' | 'SNOOZED'
export type VisitType   = 'visit' | 'event'
export type EventStatus = 'scheduled' | 'completed' | 'cancelled'
export type EventType   = 'tasting' | 'tasking' | 'private_event'
export type VisitAction = 'stocked' | 'checked' | 'order-placed' | 'issue-reported'

export interface StoreVisit {
  id:               string
  date:             string
  rep:              string
  onShelf:          number
  action?:          VisitAction
  logType?:         string
  notes:            string
  visitType:        'visit'
  contactId?:       string
  contactName?:     string
  bottlesSold?:     number
  takeaways?:       string
  accomplishments?: string
  hoursWorked?:     number
}

export interface StoreOrder {
  id:         string
  placedAt:   string
  quantity:   number
  status:     'delivered' | 'in-transit' | 'pending'
  invoiceRef: string
}

export interface SupplierOrder {
  id:         string
  poNumber:   string
  product:    string
  supplier:   string
  quantity:   number
  orderedAt:  string
  expectedAt: string
  status:     'pending' | 'in-transit' | 'delivered'
  notes?:     string
}

export interface Event {
  id:               string
  type:             EventType
  title?:           string | null
  storeId?:         string | null
  storeName?:       string | null
  region?:          string | null
  regionName?:      string | null
  chainId?:         string | null
  chainName?:       string | null
  address?:         string | null
  bottlesSold?:     number | null
  scheduledAt:      string
  endTime?:         string | null
  status:           EventStatus
  notes?:           string | null
  completionNotes?: string | null
  takeaways?:       string | null
  accomplishments?: string | null
  hoursWorked?:     number | null
  closedByRepId?:   string | null
  closedByName?:    string | null
  contactId?:       string | null
  contactName?:     string | null
  reps:             { id: string; name: string }[]
  visitId?:         string | null
}

export interface Chain {
  id:   string
  name: string
  _count: { stores: number }
}

export interface DashboardStore {
  id:            string
  name:          string
  displayName:   string | null
  address:       string | null
  region:        string
  regionName:    string
  chainId:       string | null
  chainName:     string | null
  storeNumber:   string | null
  repId:         string | null
  rep:           string | null
  latitude?:     number
  longitude?:    number
  onShelf:       number
  inProcess:     number
  daysOfSupply:  number | null
  depletionRate: number | null
  lastVisit:     string | null
  status:        StoreStatus
  deactivatedAt: string | null
  hasAlert:      boolean
  alertType:     AlertType | null
}

/** An inactive store is kept on record but dropped from day-to-day surfaces. */
export type StoreStatus = 'active' | 'inactive'

export interface Rep {
  id:           string
  name:         string
  email:        string
  phone?:       string | null
  allRegions:   boolean
  markets:      string[]
  clerkUserId?: string | null
  region:       string
  regionName:   string
  status:       'active' | 'inactive'
}

export interface ClerkUser {
  id:    string
  name:  string
  email: string
}

export interface Contact {
  id:          string
  name:        string
  role?:       string
  phone?:      string
  email?:      string
  chainId?:    string
  chainName?:  string
  storeIds:    string[]
  storeNames:  string[]
  notes?:      string
  createdAt:   string
}

export interface Alert {
  id:          string
  type:        AlertType
  status:      AlertStatus
  message:     string
  triggeredAt: string
  resolvedAt?: string
  store?: {
    id:     string
    name:   string
    region: { name: string; slug: string }
  }
}

export interface ChainInventorySnapshot {
  chainId:       string
  chainName:     string
  casesDeployed: number
  casesOnShelf:  number
  casesOffShelf: number
  offShelfPct:   number
  storeCount:    number
}

export interface StoreDeliverySnapshot {
  storeId:       string
  storeName:     string
  chainId:       string | null
  casesDeployed: number
  casesOnShelf:  number
  casesOffShelf: number
  offShelfPct:   number
}

export interface RepDeliverySnapshot {
  repId:         string
  repName:       string
  casesDeployed: number
  casesOnShelf:  number
  casesOffShelf: number
  offShelfPct:   number
}

export interface MarketInventorySnapshot {
  slug:                       string
  name:                       string
  casesDeployed:              number
  bottlesDeployed:            number
  bottlesOnShelf:             number
  bottlesDepleted:            number
  casesDepleted:              number
  sellThroughPct:             number
  depletionRateBottlesPerDay: number
  depletionRateWeeklyCases:   number
}

export interface InventorySnapshot {
  totalCasesMade:             number
  totalTransferred:           number  // warehouse → on-hand
  casesInWarehouse:           number  // big warehouse balance
  onHandCases:                number  // on-hand balance
  onHandBottles:              number
  casesDeployed:              number
  bottlesDeployed:            number
  bottlesOnShelf:             number
  bottlesDepleted:            number  // off shelf (deployed - on shelf)
  casesDepleted:              number  // off shelf in cases
  casesOnShelf:               number
  eventSalesBottles:          number
  eventSalesCases:            number
  casesSold:                  number  // manually recorded distributor depletions
  bottlesSold:                number
  sellThroughPct:             number  // casesSold / casesDeployed
  depletionRateBottlesPerDay: number
  depletionRateWeeklyCases:   number
  warehouseWeeksLeft:         number | null
  reorderDate:                string | null
  recommendedOrderCases:      number | null
  reorderAlert:               boolean
  reorderLeadWeeks:           number
  bufferWeeks:                number
  markets:                    MarketInventorySnapshot[]
  chains:                     ChainInventorySnapshot[]
  storeDeliveries:            StoreDeliverySnapshot[]
  repDeliveries:              RepDeliverySnapshot[]
}
