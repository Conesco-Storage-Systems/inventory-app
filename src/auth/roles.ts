export type Role = 'admin' | 'inventoryManager' | 'sales' | 'viewer' | 'directorOfProcurement'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  inventoryManager: 'Inventory Manager',
  sales: 'Sales',
  viewer: 'Viewer',
  directorOfProcurement: 'Director of Procurement',
}

export interface Permissions {
  addItems: boolean
  editItems: boolean
  deleteItems: boolean
  manageLocations: boolean
  deleteLocations: boolean
  restoreLocations: boolean
  manageUsers: boolean
  // Not wired to anything yet — the Bill of Lading and Sales Order tools
  // these describe haven't been built. Defined now so the roles above
  // don't need to change shape once those tools exist.
  generateBillOfLading: boolean
  generateCustomerSheet: boolean
  manageSalesOrders: boolean
  holdItemsForOrder: boolean
  viewProcurementDashboard: boolean
}

const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  admin: {
    addItems: true,
    editItems: true,
    deleteItems: true,
    manageLocations: true,
    deleteLocations: true,
    restoreLocations: true,
    manageUsers: true,
    generateBillOfLading: true,
    generateCustomerSheet: true,
    manageSalesOrders: true,
    holdItemsForOrder: true,
    viewProcurementDashboard: true,
  },
  inventoryManager: {
    addItems: true,
    editItems: true,
    deleteItems: true,
    manageLocations: true,
    deleteLocations: true,
    restoreLocations: true,
    manageUsers: false,
    generateBillOfLading: true,
    generateCustomerSheet: true,
    manageSalesOrders: false,
    holdItemsForOrder: false,
    viewProcurementDashboard: false,
  },
  sales: {
    addItems: false,
    editItems: false,
    deleteItems: false,
    manageLocations: false,
    deleteLocations: false,
    restoreLocations: false,
    manageUsers: false,
    generateBillOfLading: false,
    generateCustomerSheet: true,
    manageSalesOrders: true,
    holdItemsForOrder: true,
    viewProcurementDashboard: false,
  },
  viewer: {
    addItems: false,
    editItems: false,
    deleteItems: false,
    manageLocations: false,
    deleteLocations: false,
    restoreLocations: false,
    manageUsers: false,
    generateBillOfLading: false,
    generateCustomerSheet: false,
    manageSalesOrders: false,
    holdItemsForOrder: false,
    viewProcurementDashboard: false,
  },
  // Everything else stays Viewer-level for now — the procurement page
  // (SOs/invoices/BOLs) is being built step by step; more permissions
  // here will get filled in as that work continues.
  directorOfProcurement: {
    addItems: false,
    editItems: false,
    deleteItems: false,
    manageLocations: false,
    deleteLocations: false,
    restoreLocations: false,
    manageUsers: false,
    generateBillOfLading: false,
    generateCustomerSheet: false,
    manageSalesOrders: false,
    holdItemsForOrder: false,
    viewProcurementDashboard: true,
  },
}

export function getPermissions(role: Role | null): Permissions {
  return ROLE_PERMISSIONS[role as Role] ?? ROLE_PERMISSIONS.viewer
}

const CACHED_ROLE_KEY = 'inventoryApp.lastKnownRole'

// Same reasoning as the cached-email pattern in authClient.ts: a device
// that's already confirmed a role shouldn't lose all its permissions just
// because a background refetch couldn't reach Supabase while offline.
export function getCachedRole(): Role | null {
  try {
    const stored = localStorage.getItem(CACHED_ROLE_KEY)
    return stored ? (stored as Role) : null
  } catch {
    return null
  }
}

export function setCachedRole(role: Role | null): void {
  try {
    if (role) localStorage.setItem(CACHED_ROLE_KEY, role)
    else localStorage.removeItem(CACHED_ROLE_KEY)
  } catch {
    // ignore write failures
  }
}
