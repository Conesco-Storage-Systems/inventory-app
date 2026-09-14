import { createContext, useContext } from 'react'
import { getPermissions, type Permissions, type Role } from '../auth/roles'

interface RoleContextValue {
  role: Role | null
  permissions: Permissions
}

const RoleContext = createContext<RoleContextValue>({ role: null, permissions: getPermissions(null) })

export const RoleProvider = RoleContext.Provider

export function useRole(): RoleContextValue {
  return useContext(RoleContext)
}
