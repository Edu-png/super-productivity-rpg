import { Injectable, effect, signal } from '@angular/core';

const VOLUME_KEY = 'rpg-music-volume';
const MUTED_KEY = 'rpg-music-muted';
const TRACK_SRC = 'assets/rpg/bgm/theme.wav';
// Boosts the loudest setting a bit above the file's native level (Web Audio
// gain can exceed 1.0, unlike HTMLMediaElement.volume which caps at 1.0).
// The generated track is already normalized close to full scale, so this
// stays modest to avoid harsh clipping at 100%.
const MAX_GAIN = 1.4;

@Injectable({ providedIn: 'root' })
export class RpgMusicService {
  private readonly _audio = new Audio(TRACK_SRC);
  private _audioContext: AudioContext | null = null;
  private _gainNode: GainNode | null = null;
  readonly volume = signal(this._loadNumber(VOLUME_KEY, 40));
  readonly muted = signal(localStorage.getItem(MUTED_KEY) === '1');
  // Flips to false if TRACK_SRC 404s/fails to decode - lets the UI explain why
  // nothing plays instead of failing silently.
  readonly trackAvailable = signal(true);

  constructor() {
    this._audio.loop = true;
    // All attenuation/boost happens on the gain node instead, so it isn't
    // capped at the element's native 0-1 range.
    this._audio.volume = 1;
    this._audio.addEventListener('error', () => this.trackAvailable.set(false));
    effect(() => {
      const gain = this.muted() ? 0 : (this.volume() / 100) * MAX_GAIN;
      if (this._gainNode) this._gainNode.gain.value = gain;
    });
  }

  start(): void {
    if (this.muted()) return;
    this._ensureGraph();
    void this._audioContext?.resume();
    void this._audio.play().catch(() => {
      // Blocked by autoplay policy or track missing - volume/mute controls
      // still work once the user interacts with the page.
    });
  }

  stop(): void {
    this._audio.pause();
  }

  setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    this.volume.set(clamped);
    localStorage.setItem(VOLUME_KEY, String(clamped));
    if (clamped > 0 && this.muted()) this.setMuted(false);
  }

  toggleMuted(): void {
    this.setMuted(!this.muted());
  }

  setMuted(value: boolean): void {
    this.muted.set(value);
    localStorage.setItem(MUTED_KEY, value ? '1' : '0');
    if (value) this.stop();
    else this.start();
  }

  private _ensureGraph(): void {
    if (this._audioContext) return;
    try {
      this._audioContext = new AudioContext();
      const source = this._audioContext.createMediaElementSource(this._audio);
      this._gainNode = this._audioContext.createGain();
      this._gainNode.gain.value = this.muted() ? 0 : (this.volume() / 100) * MAX_GAIN;
      source.connect(this._gainNode);
      this._gainNode.connect(this._audioContext.destination);
    } catch {
      // Web Audio unavailable for some reason - the element itself still
      // plays at its native (uncapped-boost) volume via `_audio.volume`.
    }
  }

  private _loadNumber(key: string, fallback: number): number {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
