let ctx: AudioContext | null = null;

function ctx_(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.3) {
  try {
    const c = ctx_();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch { /* audio not available */ }
}

function water() {
  tone(800, 0.15, "sine", 0.25);
  setTimeout(() => tone(1200, 0.1, "sine", 0.15), 80);
}

function exercise() {
  tone(660, 0.12, "triangle", 0.3);
  setTimeout(() => tone(880, 0.18, "triangle", 0.3), 100);
}

function normal() {
  tone(520, 0.2, "sine", 0.25);
}

export function playReminderSound(type: "water" | "exercise" | "normal") {
  if (type === "water") water();
  else if (type === "exercise") exercise();
  else normal();
}
