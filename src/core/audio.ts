let ctx: AudioContext | null = null;

function c(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function play(
  notes: { freq: number; start: number; duration: number; type?: OscillatorType; vol?: number }[],
  volume = 0.5,
) {
  try {
    const ac = c();
    const master = ac.createGain();
    master.gain.value = volume;
    master.connect(ac.destination);
    for (const n of notes) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = n.type ?? "sine";
      osc.frequency.value = n.freq;
      const t = ac.currentTime + n.start;
      g.gain.setValueAtTime(n.vol ?? 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + n.duration);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + n.duration);
    }
  } catch { /* audio not available */ }
}

function waterSounds(v: number) {
  play([
    { freq: 880, start: 0, duration: 0.12, vol: 0.25 },
    { freq: 660, start: 0.1, duration: 0.12, vol: 0.2 },
    { freq: 990, start: 0.22, duration: 0.2, vol: 0.28, type: "sine" },
    { freq: 1200, start: 0.35, duration: 0.25, vol: 0.15, type: "sine" },
  ], v);
}

function exerciseSounds(v: number) {
  play([
    { freq: 523, start: 0, duration: 0.15, vol: 0.3, type: "triangle" },
    { freq: 659, start: 0.12, duration: 0.15, vol: 0.3, type: "triangle" },
    { freq: 784, start: 0.24, duration: 0.25, vol: 0.35, type: "triangle" },
    { freq: 1047, start: 0.5, duration: 0.35, vol: 0.35, type: "triangle" },
  ], v);
}

function normalSounds(v: number) {
  play([
    { freq: 660, start: 0, duration: 0.18, vol: 0.25 },
    { freq: 880, start: 0.15, duration: 0.25, vol: 0.3 },
    { freq: 660, start: 0.35, duration: 0.15, vol: 0.18 },
  ], v);
}

export function playReminderSound(type: "water" | "exercise" | "normal", volume = 0.5) {
  if (type === "water") waterSounds(volume);
  else if (type === "exercise") exerciseSounds(volume);
  else normalSounds(volume);
}

export function playSoundFile(dataUrl: string, volume = 0.5): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(dataUrl);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    } catch (e) {
      reject(e);
    }
  });
}
