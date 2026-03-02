import { ipcMain } from 'electron'
import { IpcEvents } from '@common/ipc-events'
import { vaultManager, VaultCredential } from '../vault/manager'

export function registerVaultHandlers(): void {
  // Get vault status (configured / unlocked)
  ipcMain.handle(IpcEvents.VAULT_STATUS, () => {
    try {
      return { success: true, ...vaultManager.getStatus() }
    } catch (error) {
      console.error('[IPC Vault] Failed to get status:', error)
      return { success: false, error: String(error) }
    }
  })

  // Setup vault (first time — set master password + credential)
  ipcMain.handle(
    IpcEvents.VAULT_SETUP,
    async (_event, masterPassword: string, credential: VaultCredential) => {
      try {
        await vaultManager.setup(masterPassword, credential)
        return { success: true }
      } catch (error) {
        console.error('[IPC Vault] Failed to setup:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Unlock vault with master password
  ipcMain.handle(IpcEvents.VAULT_UNLOCK, async (_event, masterPassword: string) => {
    try {
      await vaultManager.unlock(masterPassword)
      return { success: true }
    } catch (error) {
      console.error('[IPC Vault] Failed to unlock:', error)
      return { success: false, error: String(error) }
    }
  })

  // Lock vault (clear in-memory data)
  ipcMain.handle(IpcEvents.VAULT_LOCK, () => {
    try {
      vaultManager.lock()
      return { success: true }
    } catch (error) {
      console.error('[IPC Vault] Failed to lock:', error)
      return { success: false, error: String(error) }
    }
  })

  // Save credential (while unlocked)
  ipcMain.handle(IpcEvents.VAULT_SAVE, async (_event, credential: VaultCredential) => {
    try {
      await vaultManager.save(credential)
      return { success: true }
    } catch (error) {
      console.error('[IPC Vault] Failed to save:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get decrypted credential (while unlocked)
  ipcMain.handle(IpcEvents.VAULT_GET_CREDENTIAL, () => {
    try {
      const credential = vaultManager.getCredential()
      if (!credential) {
        return { success: false, error: 'Vault is locked' }
      }
      return { success: true, credential }
    } catch (error) {
      console.error('[IPC Vault] Failed to get credential:', error)
      return { success: false, error: String(error) }
    }
  })

  // Change master password (while unlocked)
  ipcMain.handle(IpcEvents.VAULT_CHANGE_PASSWORD, async (_event, newMasterPassword: string) => {
    try {
      await vaultManager.changeMasterPassword(newMasterPassword)
      return { success: true }
    } catch (error) {
      console.error('[IPC Vault] Failed to change password:', error)
      return { success: false, error: String(error) }
    }
  })

  // Delete vault
  ipcMain.handle(IpcEvents.VAULT_DELETE, () => {
    try {
      vaultManager.delete()
      return { success: true }
    } catch (error) {
      console.error('[IPC Vault] Failed to delete:', error)
      return { success: false, error: String(error) }
    }
  })
}
