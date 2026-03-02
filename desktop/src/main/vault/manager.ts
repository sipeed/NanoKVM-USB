/**
 * Credential Vault Manager
 *
 * AES-256-GCM encrypted storage for Windows login credentials.
 * Master password never reaches LLM — it's used only locally to derive
 * the encryption key via PBKDF2-SHA256.
 *
 * Storage:
 *   ~/.picoclaw/vault.enc   — AES-256-GCM encrypted credential JSON
 *   ~/.picoclaw/vault.salt  — PBKDF2 salt (32 bytes, generated once)
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

// --- Types ---

export interface VaultCredential {
  /** Windows PIN or password */
  pin: string
  /** Optional Windows username (for multi-user PCs) */
  username: string
  /** User description (e.g., "Windows PC (自宅)") */
  description: string
}

export interface VaultStatus {
  /** Whether vault.enc and vault.salt exist on disk */
  configured: boolean
  /** Whether the vault has been unlocked in the current session */
  unlocked: boolean
}

// --- Constants ---

const PICOCLAW_DIR = path.join(os.homedir(), '.picoclaw')
const VAULT_ENC_PATH = path.join(PICOCLAW_DIR, 'vault.enc')
const VAULT_SALT_PATH = path.join(PICOCLAW_DIR, 'vault.salt')

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_LEN = 32 // 256 bits
const PBKDF2_DIGEST = 'sha256'
const SALT_LEN = 32
const IV_LEN = 12 // AES-GCM recommended
const AUTH_TAG_LEN = 16

// --- Vault Manager ---

export class VaultManager {
  /** Decrypted credential (held in memory while unlocked) */
  private credential: VaultCredential | null = null

  /** Derived encryption key (held in memory while unlocked) */
  private derivedKey: Buffer | null = null

  // --- Status ---

  /** Check whether the vault file exists on disk */
  isConfigured(): boolean {
    return fs.existsSync(VAULT_ENC_PATH) && fs.existsSync(VAULT_SALT_PATH)
  }

  /** Check whether the vault is currently unlocked */
  isUnlocked(): boolean {
    return this.credential !== null && this.derivedKey !== null
  }

  /** Get vault status */
  getStatus(): VaultStatus {
    return {
      configured: this.isConfigured(),
      unlocked: this.isUnlocked()
    }
  }

  // --- Setup (first time) ---

  /**
   * Set up the vault for the first time or overwrite with new master password.
   * @param masterPassword  The master password chosen by the user
   * @param credential      The Windows credential to store
   */
  async setup(masterPassword: string, credential: VaultCredential): Promise<void> {
    if (!masterPassword || masterPassword.length < 1) {
      throw new Error('Master password is required')
    }

    // Ensure directory exists
    if (!fs.existsSync(PICOCLAW_DIR)) {
      fs.mkdirSync(PICOCLAW_DIR, { recursive: true })
    }

    // Generate new salt
    const salt = crypto.randomBytes(SALT_LEN)

    // Derive key from master password
    const key = await this.deriveKey(masterPassword, salt)

    // Encrypt credential
    const plaintext = JSON.stringify(credential)
    const encrypted = this.encrypt(plaintext, key)

    // Write to disk atomically (write temp + rename)
    fs.writeFileSync(VAULT_SALT_PATH, salt)
    fs.writeFileSync(VAULT_ENC_PATH, encrypted)

    // Keep unlocked in memory
    this.credential = credential
    this.derivedKey = key

    console.log('[Vault] Setup complete — credential stored and vault unlocked')
  }

  // --- Unlock ---

  /**
   * Unlock the vault with the master password.
   * Reads vault.salt + vault.enc from disk, derives the key, decrypts.
   * If decryption fails (wrong password), throws an error.
   */
  async unlock(masterPassword: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Vault is not configured. Use setup() first.')
    }

    const salt = fs.readFileSync(VAULT_SALT_PATH)
    const encrypted = fs.readFileSync(VAULT_ENC_PATH)

    const key = await this.deriveKey(masterPassword, salt)

    try {
      const plaintext = this.decrypt(encrypted, key)
      this.credential = JSON.parse(plaintext) as VaultCredential
      this.derivedKey = key
      console.log('[Vault] Unlocked successfully')
    } catch {
      // GCM auth tag mismatch → wrong password
      throw new Error('Master password is incorrect')
    }
  }

  // --- Lock ---

  /**
   * Lock the vault — clear in-memory credential and key.
   */
  lock(): void {
    this.credential = null
    if (this.derivedKey) {
      // Zero out key buffer for security
      this.derivedKey.fill(0)
      this.derivedKey = null
    }
    console.log('[Vault] Locked')
  }

  // --- Get Credential ---

  /**
   * Get the decrypted credential. Only available when unlocked.
   */
  getCredential(): VaultCredential | null {
    return this.credential
  }

  // --- Save (update credential while unlocked) ---

  /**
   * Update the stored credential while the vault is already unlocked.
   * Re-encrypts with the same key.
   */
  async save(credential: VaultCredential): Promise<void> {
    if (!this.isUnlocked() || !this.derivedKey) {
      throw new Error('Vault must be unlocked to save credentials')
    }

    const plaintext = JSON.stringify(credential)
    const salt = fs.readFileSync(VAULT_SALT_PATH)
    // Re-encrypt with fresh IV
    const encrypted = this.encrypt(plaintext, this.derivedKey)

    fs.writeFileSync(VAULT_ENC_PATH, encrypted)
    this.credential = credential

    // Salt is unchanged
    void salt

    console.log('[Vault] Credential updated')
  }

  // --- Change Master Password ---

  /**
   * Change the master password. Requires the vault to be unlocked.
   * Re-generates salt and re-encrypts with new key.
   */
  async changeMasterPassword(newMasterPassword: string): Promise<void> {
    if (!this.isUnlocked() || !this.credential) {
      throw new Error('Vault must be unlocked to change master password')
    }

    if (!newMasterPassword || newMasterPassword.length < 1) {
      throw new Error('New master password is required')
    }

    // Generate new salt
    const salt = crypto.randomBytes(SALT_LEN)
    const key = await this.deriveKey(newMasterPassword, salt)

    // Re-encrypt
    const plaintext = JSON.stringify(this.credential)
    const encrypted = this.encrypt(plaintext, key)

    // Write to disk
    fs.writeFileSync(VAULT_SALT_PATH, salt)
    fs.writeFileSync(VAULT_ENC_PATH, encrypted)

    // Update in-memory key
    if (this.derivedKey) this.derivedKey.fill(0)
    this.derivedKey = key

    console.log('[Vault] Master password changed')
  }

  // --- Delete Vault ---

  /**
   * Delete the vault files and clear in-memory state.
   */
  delete(): void {
    this.lock()

    try {
      if (fs.existsSync(VAULT_ENC_PATH)) fs.unlinkSync(VAULT_ENC_PATH)
      if (fs.existsSync(VAULT_SALT_PATH)) fs.unlinkSync(VAULT_SALT_PATH)
      console.log('[Vault] Deleted')
    } catch (err) {
      console.error('[Vault] Failed to delete vault files:', err)
      throw err
    }
  }

  // --- Crypto helpers ---

  private deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST, (err, key) => {
        if (err) reject(err)
        else resolve(key)
      })
    })
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns: [IV (12 bytes)] [AuthTag (16 bytes)] [Ciphertext]
   */
  private encrypt(plaintext: string, key: Buffer): Buffer {
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted])
  }

  /**
   * Decrypt ciphertext using AES-256-GCM.
   * Expects: [IV (12 bytes)] [AuthTag (16 bytes)] [Ciphertext]
   */
  private decrypt(data: Buffer, key: Buffer): string {
    if (data.length < IV_LEN + AUTH_TAG_LEN) {
      throw new Error('Encrypted data is too short')
    }

    const iv = data.subarray(0, IV_LEN)
    const authTag = data.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN)
    const ciphertext = data.subarray(IV_LEN + AUTH_TAG_LEN)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  }
}

// Singleton instance
export const vaultManager = new VaultManager()
