import { appEvents, EVENT_NAMES } from '../events/eventBus.js'
import { localStorageAdapter } from '../storage/localStorageAdapter.js'

const STORAGE_KEY = 'hospital-helpdesk:notification-sound-settings:v1'
const DEFAULT_SETTINGS = Object.freeze({ enabled: false, muted: false })
const patterns = Object.freeze({
  new_ticket: Object.freeze([
    { frequency: 659.25, offset: 0, duration: 0.18 },
    { frequency: 880, offset: 0.2, duration: 0.18 },
    { frequency: 1046.5, offset: 0.4, duration: 0.32 },
  ]),
  assignment: Object.freeze([
    { frequency: 523.25, offset: 0, duration: 0.28 },
    { frequency: 659.25, offset: 0.32, duration: 0.28 },
  ]),
})

let audioContext = null
let interactionEnabled = false
let initialized = false
const playedEvents = new Set()

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

// Single renderer shared by the settings test button and live notifications.
// A bright fundamental plus a softer octave harmonic, routed through a compressor so the
// chime is clearly audible near full scale without clipping.
function renderPattern(context, pattern) {
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.setValueAtTime(-12, context.currentTime)
  compressor.ratio.setValueAtTime(4, context.currentTime)
  const master = context.createGain()
  master.gain.setValueAtTime(0.9, context.currentTime)
  compressor.connect(master)
  master.connect(context.destination)
  const start = context.currentTime + 0.02
  let end = start
  pattern.forEach(({ frequency, offset, duration }) => {
    const at = start + offset
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.75, at + 0.015)
    gain.gain.setValueAtTime(0.75, at + duration * 0.35)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    gain.connect(compressor)
    ;[{ type: 'square', ratio: 1, level: 0.35 }, { type: 'sine', ratio: 1, level: 0.6 }, { type: 'sine', ratio: 2, level: 0.25 }].forEach(({ type, ratio, level }) => {
      const oscillator = context.createOscillator()
      const voice = context.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency * ratio, at)
      voice.gain.setValueAtTime(level, at)
      oscillator.connect(voice)
      voice.connect(gain)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.03)
    })
    end = Math.max(end, at + duration + 0.05)
  })
  setTimeout(() => { try { master.disconnect() } catch { /* already released */ } }, Math.ceil((end - context.currentTime) * 1000) + 200)
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
    // Keep listening until a user gesture actually unlocks a running AudioContext (autoplay policy).
    const unlock = async () => {
      if (!this.getSettings().enabled) return
      if (await unlockAudio() && getAudioContext()?.state === 'running') {
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
      }
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
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
  async play(sound, { userGesture = false, eventKey = null } = {}) {
    const settings = this.getSettings()
    if (!settings.enabled || settings.muted) return false
    // Reserve the event key synchronously, before any await, so concurrent SSE/polling/reconnect deliveries of the same notification cannot both play.
    if (eventKey) {
      if (playedEvents.has(eventKey)) return false
      playedEvents.add(eventKey)
      if (playedEvents.size > 500) playedEvents.delete(playedEvents.values().next().value)
    }
    if (!interactionEnabled && !userGesture) return false
    try {
      if (userGesture && !await unlockAudio()) return false
      const context = getAudioContext()
      const pattern = this.getPattern(sound)
      if (!context || !pattern.length) return false
      if (context.state === 'suspended') await context.resume()
      if (context.state !== 'running') return false
      renderPattern(context, pattern)
      return true
    } catch {
      return false
    }
  },
  preview(sound) {
    return this.play(sound, { userGesture: true })
  },
}
