import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'

const STORAGE_KEY = 'hospital-helpdesk:notification-sound-settings:v1'
const DEFAULT_SETTINGS = Object.freeze({ enabled: false, muted: false })
const patterns = Object.freeze({
  new_ticket: Object.freeze([
    { frequency: 523.25, offset: 0, duration: 0.12 },
    { frequency: 659.25, offset: 0.14, duration: 0.12 },
    { frequency: 783.99, offset: 0.28, duration: 0.2 },
  ]),
  assignment: Object.freeze([
    { frequency: 392, offset: 0, duration: 0.2 },
    { frequency: 293.66, offset: 0.23, duration: 0.3 },
  ]),
})

let audioContext = null
let interactionEnabled = false
let initialized = false

function getAudioContext() {
  if (audioContext || typeof window === 'undefined') return audioContext
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (AudioContextClass) audioContext = new AudioContextClass()
  return audioContext
}

async function unlockAudio() {
  interactionEnabled = true
  try {
    const context = getAudioContext()
    if (context?.state === 'suspended') await context.resume()
    return Boolean(context)
  } catch {
    return false
  }
}

function saveSettings(settings) {
  localStorageAdapter.set(STORAGE_KEY, settings)
  appEvents.publish(EVENT_NAMES.NOTIFICATION_SOUND_SETTINGS_CHANGED, settings)
  return settings
}

export const notificationSoundService = {
  initialize() {
    if (initialized || typeof window === 'undefined') return
    initialized = true
    const unlock = () => { if (this.getSettings().enabled) unlockAudio() }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  },
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...localStorageAdapter.get(STORAGE_KEY, DEFAULT_SETTINGS) }
  },
  setEnabled(enabled) {
    if (enabled) unlockAudio()
    return saveSettings({ ...this.getSettings(), enabled: Boolean(enabled) })
  },
  setMuted(muted) {
    return saveSettings({ ...this.getSettings(), muted: Boolean(muted) })
  },
  getPattern(sound) {
    return patterns[sound] ?? []
  },
  async play(sound, { force = false } = {}) {
    const settings = this.getSettings()
    if ((!settings.enabled || settings.muted) && !force) return false
    if (!interactionEnabled && !force) return false
    try {
      if (force && !await unlockAudio()) return false
      const context = getAudioContext()
      const pattern = this.getPattern(sound)
      if (!context || !pattern.length) return false
      if (context.state === 'suspended') await context.resume()
      if (context.state !== 'running') return false
      const start = context.currentTime + 0.02
      pattern.forEach(({ frequency, offset, duration }) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = sound === 'assignment' ? 'triangle' : 'sine'
        oscillator.frequency.setValueAtTime(frequency, start + offset)
        gain.gain.setValueAtTime(0.0001, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(start + offset)
        oscillator.stop(start + offset + duration + 0.02)
      })
      return true
    } catch {
      return false
    }
  },
  preview(sound) {
    return this.play(sound, { force: true })
  },
}
