/** Original generated club loop: no samples, recordings or external requests. */
export const CLUB_TEMPO = 108;
export const CLUB_STEPS = 64;
const STEP_SECONDS = 60 / CLUB_TEMPO / 4;
const LOOKAHEAD = 0.12;
const MAX_VOICES = 48;
const HEADROOM = 0.32;

export type ClubNote = {
  instrument: "kick" | "hat" | "snare" | "bass" | "chord" | "spark";
  frequency?: number;
  duration: number;
  level: number;
};
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Four original bars of percussion, bass, warm chords and small accents. */
export function clubStep(value: number): ClubNote[] {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return [];
  const step = ((value % CLUB_STEPS) + CLUB_STEPS) % CLUB_STEPS;
  const beat = step % 16;
  const root = [45, 48, 50, 43][Math.floor(step / 16)];
  const notes: ClubNote[] = [];
  if (beat % 4 === 0)
    notes.push({ instrument: "kick", duration: 0.3, level: 0.65 });
  if (beat % 2 === 0)
    notes.push({
      instrument: "hat",
      duration: 0.065,
      level: beat % 4 === 2 ? 0.055 : 0.025,
    });
  if (beat === 4 || beat === 12)
    notes.push({ instrument: "snare", duration: 0.16, level: 0.1 });
  const bass = [
    0,
    null,
    null,
    7,
    null,
    null,
    0,
    null,
    12,
    null,
    7,
    null,
    0,
    null,
    null,
    7,
  ][beat];
  if (bass !== null)
    notes.push({
      instrument: "bass",
      frequency: frequency(root + bass),
      duration: 0.3,
      level: 0.14,
    });
  if (beat === 0)
    for (const interval of [0, 3, 7, 10])
      notes.push({
        instrument: "chord",
        frequency: frequency(root + 12 + interval),
        duration: 1.5,
        level: 0.027,
      });
  if (beat === 6 || beat === 14)
    notes.push({
      instrument: "spark",
      frequency: frequency(root + 24 + (beat === 6 ? 7 : 3)),
      duration: 0.28,
      level: 0.05,
    });
  return notes;
}

type Scheduler = {
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  clearInterval: (handle: unknown) => void;
};
type Voice = {
  source: AudioBufferSourceNode | OscillatorNode;
  nodes: AudioNode[];
  end: number;
  ended: boolean;
};
type Graph = {
  context: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  noise: AudioBuffer;
  voices: Set<Voice>;
  closed: boolean;
};

export type ClubAudioOptions = {
  contextFactory?: () => AudioContext;
  scheduler?: Scheduler;
  volume?: number;
};

function browserContext() {
  const Constructor =
    globalThis.AudioContext ||
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Constructor) throw new Error("Web Audio is unavailable.");
  return new Constructor({ latencyHint: "interactive" });
}

/** Construction is silent; only an explicit play() call creates/resumes audio. */
export function createClubAudio({
  contextFactory = browserContext,
  scheduler,
  volume: initialVolume = 0.25,
}: ClubAudioOptions = {}) {
  const timers: Scheduler = scheduler || {
    setInterval: (callback, milliseconds) =>
      globalThis.setInterval(callback, milliseconds),
    clearInterval: (handle) =>
      globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  };
  let volume = Number.isFinite(initialVolume)
    ? Math.max(0, Math.min(1, initialVolume))
    : 0.25;
  let graph: Graph | null = null,
    timer: unknown = null,
    playing = false,
    disposed = false;
  let pending: Promise<boolean> | null = null,
    generation = 0,
    nextTime = 0,
    step = 0,
    error: string | null = null;

  function releaseVoice(owner: Graph, voice: Voice, stop = false) {
    if (voice.ended) return;
    voice.ended = true;
    voice.source.onended = null;
    if (stop)
      try {
        voice.source.stop();
      } catch {}
    for (const node of voice.nodes) node.disconnect();
    owner.voices.delete(voice);
  }
  function closeGraph(owner: Graph) {
    if (owner.closed) return;
    owner.closed = true;
    for (const voice of [...owner.voices]) releaseVoice(owner, voice, true);
    owner.master.disconnect();
    owner.limiter.disconnect();
    try {
      void Promise.resolve(owner.context.close()).catch(() => {});
    } catch {}
  }
  function makeNoise(context: AudioContext) {
    const noise = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.35),
      context.sampleRate,
    );
    const data = noise.getChannelData(0);
    let seed = 617;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return noise;
  }
  function note(owner: Graph, value: ClubNote, at: number) {
    if (owner.voices.size >= MAX_VOICES) return;
    const context = owner.context;
    const percussion =
      value.instrument === "hat" || value.instrument === "snare";
    const source = percussion
      ? context.createBufferSource()
      : context.createOscillator();
    const filter = context.createBiquadFilter(),
      envelope = context.createGain();
    if (percussion) {
      (source as AudioBufferSourceNode).buffer = owner.noise;
      filter.type = value.instrument === "hat" ? "highpass" : "bandpass";
      filter.frequency.setValueAtTime(
        value.instrument === "hat" ? 7200 : 1800,
        at,
      );
      filter.Q.setValueAtTime(0.7, at);
    } else {
      const oscillator = source as OscillatorNode;
      oscillator.type =
        value.instrument === "bass" || value.instrument === "chord"
          ? "triangle"
          : "sine";
      oscillator.frequency.setValueAtTime(
        value.instrument === "kick" ? 145 : value.frequency!,
        at,
      );
      if (value.instrument === "kick")
        oscillator.frequency.exponentialRampToValueAtTime(43, at + 0.15);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        value.instrument === "bass"
          ? 650
          : value.instrument === "chord"
            ? 1800
            : 10000,
        at,
      );
      filter.Q.setValueAtTime(0.6, at);
    }
    const attack = value.instrument === "chord" ? 0.06 : 0.005;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(value.level, at + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + value.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(owner.master);
    const voice: Voice = {
      source,
      nodes: [source, filter, envelope],
      end: at + value.duration + 0.02,
      ended: false,
    };
    owner.voices.add(voice);
    source.onended = () => releaseVoice(owner, voice);
    source.start(at);
    source.stop(voice.end);
  }
  function schedule() {
    const owner = graph;
    if (!playing || !owner || owner.closed) return;
    const now = owner.context.currentTime;
    for (const voice of [...owner.voices])
      if (voice.end <= now) releaseVoice(owner, voice);
    // Suspended/background tabs skip stale beats instead of building a backlog.
    if (nextTime < now - STEP_SECONDS) {
      step = (step + Math.floor((now - nextTime) / STEP_SECONDS)) % CLUB_STEPS;
      nextTime = now + 0.025;
    }
    for (let count = 0; nextTime < now + LOOKAHEAD && count < 8; count++) {
      for (const value of clubStep(step)) note(owner, value, nextTime);
      step = (step + 1) % CLUB_STEPS;
      nextTime += STEP_SECONDS;
    }
  }
  async function begin(token: number) {
    let owner: Graph | null = null;
    let opened: AudioContext | null = null;
    try {
      const context = (opened = contextFactory());
      const master = context.createGain(),
        limiter = context.createDynamicsCompressor();
      owner = {
        context,
        master,
        limiter,
        noise: makeNoise(context),
        voices: new Set(),
        closed: false,
      };
      graph = owner;
      master.gain.setValueAtTime(volume * HEADROOM, context.currentTime);
      limiter.threshold.setValueAtTime(-18, context.currentTime);
      limiter.knee.setValueAtTime(16, context.currentTime);
      limiter.ratio.setValueAtTime(3, context.currentTime);
      limiter.attack.setValueAtTime(0.003, context.currentTime);
      limiter.release.setValueAtTime(0.15, context.currentTime);
      master.connect(limiter);
      limiter.connect(context.destination);
      await context.resume();
      if (disposed || token !== generation || graph !== owner) {
        closeGraph(owner);
        return false;
      }
      playing = true;
      error = null;
      step = 0;
      nextTime = context.currentTime + 0.025;
      schedule();
      timer = timers.setInterval(schedule, 25);
      return true;
    } catch {
      if (owner) closeGraph(owner);
      else if (opened)
        try {
          void Promise.resolve(opened.close()).catch(() => {});
        } catch {}
      if (token === generation) {
        graph = null;
        playing = false;
        error =
          "Music could not start. Try Play again or check your browser audio settings.";
      }
      return false;
    }
  }
  function play(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (playing) return Promise.resolve(true);
    if (pending) return pending;
    const operation = begin(++generation);
    pending = operation;
    void operation.then(() => {
      if (pending === operation) pending = null;
    });
    return operation;
  }
  function stop() {
    generation++;
    playing = false;
    pending = null;
    if (timer !== null) {
      timers.clearInterval(timer);
      timer = null;
    }
    if (graph) {
      closeGraph(graph);
      graph = null;
    }
  }
  function setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (graph && !graph.closed)
      graph.master.gain.setTargetAtTime(
        volume * HEADROOM,
        graph.context.currentTime,
        0.025,
      );
  }
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
  }
  return {
    play,
    stop,
    setVolume,
    dispose,
    get playing() {
      return playing;
    },
    get volume() {
      return volume;
    },
    get error() {
      return error;
    },
  };
}
