export type SoundAction = 'reveal' | 'flag' | 'chord' | 'explode';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.3;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  playReveal(): void {
    this.playTone(800, 0.05, 'sine', 0.25);
  }

  playFlag(): void {
    this.playTone(1200, 0.04, 'sine', 0.2);
  }

  playChord(): void {
    this.playTone(600, 0.06, 'sine', 0.2);
  }

  playExplosion(): void {
    this.playNoise(0.35, 0.35);
    this.playTone(80, 0.25, 'sine', 0.3);
  }

  playWin(): void {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      this.playTone(freq, 0.15, 'sine', 0.2, i * 0.1);
    });
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    vol: number,
    delay: number = 0,
  ): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const now = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(vol * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  private playNoise(duration: number, vol: number): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }
}
