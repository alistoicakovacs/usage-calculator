// The current vault (id + key), available to everything behind the first-run
// gate. Split from `VaultGate` so screens and tests can be given a vault
// without dragging the gate's create/restore flow along.
import { createContext, useContext } from 'react'
import type { Vault } from '../crypto/vault'

const VaultCtx = createContext<Vault | undefined>(undefined)

export function VaultProvider({ vault, children }: { vault: Vault; children: React.ReactNode }) {
  return <VaultCtx.Provider value={vault}>{children}</VaultCtx.Provider>
}

export function useVault(): Vault {
  const vault = useContext(VaultCtx)
  if (!vault) throw new Error('useVault must be used inside VaultProvider')
  return vault
}
