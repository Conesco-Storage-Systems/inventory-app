import { createContext, useContext } from 'react'
import { getPermissions, type Permissions, type Role } from '../auth/roles'

interface RoleContextValue {
  role: Role | null
  permissions: Permissions
  userId: string | null
  userEmail: string | null
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  permissions: getPermissions(null),
  userId: null,
  userEmail: null,
})

export const RoleProvider = RoleContext.Provider

export function useRole(): RoleContextValue {
  return useContext(RoleContext)
}
