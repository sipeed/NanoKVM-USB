import { checkPermission } from '@renderer/libs/media/permission'

class Camera {
  id: string = ''
  width: number = 1920
  height: number = 1080
  audioId: string = ''
  stream: MediaStream | null = null
  maxWidth: number = 0
  maxHeight: number = 0
  maxResolutionMode: '1440p30' | '1080p60' = '1440p30'

  // ── Auto-recovery state ──
  private recovering: boolean = false
  private recoveryCount: number = 0
  private lastRecoveryTime: number = 0
  private trackEndedHandler: (() => void) | null = null

  /** Max recovery attempts within the cooldown window */
  private static readonly MAX_RECOVERY_ATTEMPTS = 5
  /** Reset recovery counter after this many ms of stable streaming */
  private static readonly RECOVERY_COOLDOWN_MS = 60_000

  public async open(id: string, width: number, height: number, audioId?: string, maxResolutionMode: '1440p30' | '1080p60' = '1440p30'): Promise<void> {
    if (!id && !this.id) {
      return
    }

    // Reset max resolution cache if device changed
    if (id !== this.id) {
      this.maxWidth = 0
      this.maxHeight = 0
    }

    this.close()

    console.log('[Camera] Opening device - videoId:', id, 'audioId:', audioId)
    console.log('[Camera] Requested resolution:', width, 'x', height)

    // Get device capabilities to determine max resolution
    let requestedWidth = width
    let requestedHeight = height

    if (this.maxWidth > 0 && this.maxHeight > 0) {
      // Use cached max resolution
      if (width > this.maxWidth || height > this.maxHeight) {
        requestedWidth = this.maxWidth
        requestedHeight = this.maxHeight
        console.log('[Camera] Requested resolution exceeds device max, using max:', requestedWidth, 'x', requestedHeight)
      }
    }

    // Apply max resolution mode settings
    let finalWidth = requestedWidth
    let finalHeight = requestedHeight
    let enableAudio = false
    
    if (maxResolutionMode === '1440p30') {
      // High resolution mode: 2560x1440@30fps with audio
      finalWidth = 2560
      finalHeight = 1440
      enableAudio = true
      console.log('[Camera] Max resolution mode: 1440p@30fps (with audio)')
    } else {
      // High frame rate mode: 1920x1080@60fps without audio
      finalWidth = 1920
      finalHeight = 1080
      enableAudio = false
      console.log('[Camera] Max resolution mode: 1080p@60fps (without audio)')
    }

    const video = {
      deviceId: { exact: id },
      width: { ideal: finalWidth },
      height: { ideal: finalHeight },
      frameRate: { ideal: maxResolutionMode === '1440p30' ? 30 : 60 },
      latency: { ideal: 0 },
      resizeMode: 'none'
    }

    const isMicGranted = await checkPermission('microphone')
    const audio =
      enableAudio && isMicGranted && audioId
        ? {
            deviceId: { exact: audioId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            latency: 0
          }
        : false

    console.log('[Camera] Audio constraint:', audio)

    this.id = id
    this.width = width
    this.height = height
    this.maxResolutionMode = maxResolutionMode
    if (audioId) this.audioId = audioId

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio })
      
      // Get device capabilities to cache max resolution
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities()
        if (capabilities.width && capabilities.height) {
          this.maxWidth = capabilities.width.max || 0
          this.maxHeight = capabilities.height.max || 0
          console.log('[Camera] Device max resolution:', this.maxWidth, 'x', this.maxHeight)
        }
        
        // Log actual video settings with frame rate
        const settings = videoTrack.getSettings()
        console.log(`[Camera] Actual video settings: ${settings.width}x${settings.height}@${settings.frameRate}fps (aspectRatio: ${settings.aspectRatio})`)
      }
      
      // Log all tracks
      this.stream.getTracks().forEach((track) => {
        console.log(`[Camera] ${track.kind} track:`, track.label)
      })
    } catch (error) {
      console.error('[Camera] Failed to open with audio, retrying without audio:', error)
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      
      // Log video settings even when opened without audio
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        console.log(`[Camera] Actual video settings (audio disabled): ${settings.width}x${settings.height}@${settings.frameRate}fps (aspectRatio: ${settings.aspectRatio})`)
      }
    }

    // Monitor track health for auto-recovery
    this.attachTrackListeners()
  }

  public async updateResolution(width: number, height: number): Promise<void> {
    return this.open(this.id, width, height, this.audioId, this.maxResolutionMode)
  }

  public close(): void {
    this.removeTrackListeners()
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  /**
   * Auto-recover a frozen or ended video stream.
   * Called externally by the frame monitor when no new frames arrive.
   * Rate-limited to prevent infinite reconnection loops.
   */
  public async autoRecover(): Promise<boolean> {
    if (!this.id) {
      console.warn('[Camera] autoRecover: no device configured, skipping')
      return false
    }
    if (this.recovering) {
      console.log('[Camera] autoRecover: already in progress, skipping')
      return false
    }

    const now = Date.now()

    // Reset counter if enough time passed since last recovery (stream was stable)
    if (now - this.lastRecoveryTime > Camera.RECOVERY_COOLDOWN_MS) {
      this.recoveryCount = 0
    }

    if (this.recoveryCount >= Camera.MAX_RECOVERY_ATTEMPTS) {
      console.warn(`[Camera] autoRecover: too many attempts (${this.recoveryCount}), giving up until cooldown`)
      return false
    }

    this.recovering = true
    this.recoveryCount++
    this.lastRecoveryTime = now

    console.log(`[Camera] autoRecover: attempt ${this.recoveryCount}/${Camera.MAX_RECOVERY_ATTEMPTS} — reopening stream...`)

    try {
      await this.open(this.id, this.width, this.height, this.audioId, this.maxResolutionMode)

      // Re-attach to the video element
      const video = document.getElementById('video') as HTMLVideoElement
      if (video) {
        video.srcObject = this.stream
        console.log('[Camera] autoRecover: stream reattached to video element')
      }

      console.log('[Camera] autoRecover: success')
      return true
    } catch (err) {
      console.error('[Camera] autoRecover: failed:', err)
      return false
    } finally {
      this.recovering = false
    }
  }

  /** Whether recovery is currently in progress */
  public isRecovering(): boolean {
    return this.recovering
  }

  /**
   * Attach 'ended' event listener to the video track so we can auto-recover
   * when the track dies unexpectedly (e.g., USB re-enumeration).
   */
  private attachTrackListeners(): void {
    this.removeTrackListeners()
    if (!this.stream) return

    const videoTrack = this.stream.getVideoTracks()[0]
    if (!videoTrack) return

    this.trackEndedHandler = (): void => {
      console.warn('[Camera] Video track ended unexpectedly — triggering auto-recovery')
      this.autoRecover()
    }
    videoTrack.addEventListener('ended', this.trackEndedHandler)
  }

  private removeTrackListeners(): void {
    if (this.trackEndedHandler && this.stream) {
      const videoTrack = this.stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.removeEventListener('ended', this.trackEndedHandler)
      }
    }
    this.trackEndedHandler = null
  }

  public getStream(): MediaStream | null {
    return this.stream
  }

  public isOpen(): boolean {
    return this.stream !== null
  }
}

export const camera = new Camera()
