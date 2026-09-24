import type { SettingsStore } from "./settings.ts";

type Cue = "reveal" | "flag" | "chord" | "lose" | "win";

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class Sensory {
  private context: AudioContext | null = null;
  private unlocked = false;

  constructor(private settings: SettingsStore) {}

  armOnFirstGesture(target: Window = window): () => void {
    const unlock = () => {
      this.unlocked = true;
      this.ensureContext();
      target.removeEventListener("pointerdown", unlock);
      target.removeEventListener("keydown", unlock);
    };
    target.addEventListener("pointerdown", unlock, { passive: true });
    target.addEventListener("keydown", unlock);
    return () => {
      target.removeEventListener("pointerdown", unlock);
      target.removeEventListener("keydown", unlock);
    };
  }

  cue(kind: Cue): void {
    if (this.settings.get().sound) this.play(kind);
    if (this.settings.get().haptics) this.vibrate(kind);
  }

  private play(kind: Cue): void {
    const context = this.ensureContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequencyFor(kind), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationFor(kind));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationFor(kind) + 0.02);
  }

  private vibrate(kind: Cue): void {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    const pattern: Record<Cue, number | number[]> = {
      reveal: 8,
      flag: 12,
      chord: [8, 20, 8],
      lose: [40, 40, 40],
      win: [20, 30, 20, 30, 40],
    };
    try {
      navigator.vibrate(pattern[kind]);
    } catch {
      void 0;
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (this.context) return this.context;
    const ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!ctor) return null;
    this.context = new ctor();
    return this.context;
  }
}

function frequencyFor(kind: Cue): number {
  switch (kind) {
    case "reveal":
      return 440;
    case "flag":
      return 620;
    case "chord":
      return 520;
    case "lose":
      return 160;
    case "win":
      return 880;
  }
}

function durationFor(kind: Cue): number {
  switch (kind) {
    case "reveal":
      return 0.05;
    case "flag":
      return 0.06;
    case "chord":
      return 0.08;
    case "lose":
      return 0.3;
    case "win":
      return 0.4;
  }
}
