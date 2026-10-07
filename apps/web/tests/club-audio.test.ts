import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLUB_STEPS,
  CLUB_TEMPO,
  clubStep,
  createClubAudio,
} from "../lib/club-audio";

class Param {
  value = 0;
  changes: { value: number; time: number }[] = [];
  record(value: number, time: number) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time));
    this.value = value;
    this.changes.push({ value, time });
  }
  setValueAtTime(value: number, time: number) {
    this.record(value, time);
  }
  setTargetAtTime(value: number, time: number, constant: number) {
    assert.ok(constant > 0);
    this.record(value, time);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.record(value, time);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    assert.ok(value > 0);
    this.record(value, time);
  }
}
class Node {
  disconnects = 0;
  targets: Node[] = [];
  constructor(readonly kind: string) {}
  connect(target: Node) {
    this.targets.push(target);
    return target;
  }
  disconnect() {
    this.disconnects++;
    this.targets = [];
  }
}
class Source extends Node {
  frequency = new Param();
  type = "sine";
  buffer: any = null;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  start(time: number) {
    assert.ok(Number.isFinite(time));
    this.starts.push(time);
  }
  stop(time?: number) {
    this.stops.push(time);
  }
}
class Context {
  currentTime = 0;
  sampleRate = 24000;
  destination = new Node("destination");
  nodes: any[] = [];
  buffers: Float32Array[] = [];
  closes = 0;
  resumes = 0;
  pendingResume: Promise<void> | null = null;
  make(kind: string, properties: any = {}) {
    const node = Object.assign(new Node(kind), properties);
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.make("gain", { gain: new Param() });
  }
  createDynamicsCompressor() {
    return this.make("limiter", {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    });
  }
  createBiquadFilter() {
    return this.make("filter", {
      frequency: new Param(),
      Q: new Param(),
      type: "lowpass",
    });
  }
  createOscillator() {
    const node = new Source("oscillator");
    this.nodes.push(node);
    return node;
  }
  createBufferSource() {
    const node = new Source("noise");
    this.nodes.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    assert.equal(channels, 1);
    assert.equal(sampleRate, this.sampleRate);
    const data = new Float32Array(length);
    this.buffers.push(data);
    return {
      getChannelData(index: number) {
        assert.equal(index, 0);
        return data;
      },
    };
  }
  resume() {
    this.resumes++;
    return this.pendingResume || Promise.resolve();
  }
  close() {
    this.closes++;
    return Promise.resolve();
  }
}
function harness(factory?: () => Context) {
  const contexts: Context[] = [],
    intervals = new Map<number, () => void>();
  let nextId = 0;
  const audio = createClubAudio({
    contextFactory: () => {
      const context = factory?.() || new Context();
      contexts.push(context);
      return context as unknown as AudioContext;
    },
    scheduler: {
      setInterval(callback, milliseconds) {
        assert.equal(milliseconds, 25);
        const id = ++nextId;
        intervals.set(id, callback);
        return id;
      },
      clearInterval(handle) {
        intervals.delete(handle as number);
      },
    },
  });
  function tick(time: number) {
    contexts.at(-1)!.currentTime = time;
    for (const callback of intervals.values()) callback();
  }
  return { audio, contexts, intervals, tick };
}

test("original four-bar pattern is deterministic, finite, bounded and rhythmically distinct", () => {
  assert.equal(CLUB_TEMPO, 108);
  assert.equal(CLUB_STEPS, 64);
  assert.deepEqual(clubStep(0), clubStep(64));
  assert.deepEqual(clubStep(-1), clubStep(63));
  assert.deepEqual(clubStep(NaN), []);
  assert.deepEqual(clubStep(0.5), []);
  const bars = Array.from({ length: 64 }, (_, step) => clubStep(step));
  const notes = bars.flat();
  assert.equal(notes.filter((note) => note.instrument === "kick").length, 16);
  assert.equal(notes.filter((note) => note.instrument === "snare").length, 8);
  assert.equal(notes.filter((note) => note.instrument === "chord").length, 16);
  assert.equal(
    new Set(
      notes
        .filter((note) => note.instrument === "bass")
        .map((note) => note.frequency),
    ).size > 4,
    true,
  );
  for (const step of bars) assert.ok(step.length <= 7);
  for (const note of notes) {
    assert.ok(note.duration > 0 && note.duration <= 1.5);
    assert.ok(note.level > 0 && note.level <= 0.65);
    if (note.frequency !== undefined)
      assert.ok(
        Number.isFinite(note.frequency) &&
          note.frequency >= 80 &&
          note.frequency < 3000,
      );
  }
});

test("construction remains silent; explicit Play starts bounded scheduling and Stop releases every node and context", async () => {
  const h = harness();
  assert.equal(h.contexts.length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.audio.playing, false);
  try {
    assert.equal(await h.audio.play(), true);
    assert.equal(h.contexts.length, 1);
    assert.equal(h.contexts[0].resumes, 1);
    assert.equal(h.intervals.size, 1);
    const context = h.contexts[0];
    assert.ok(context.nodes.some((node) => node.kind === "oscillator"));
    assert.ok(context.nodes.some((node) => node.kind === "noise"));
    assert.ok(context.buffers[0].some((value) => Math.abs(value) > 0.2));
    assert.ok(
      context.buffers[0].every(
        (value) => Number.isFinite(value) && Math.abs(value) <= 1,
      ),
    );
    for (let i = 1; i < 900; i++) {
      h.tick(i * 0.025);
      assert.ok(
        context.nodes.filter(
          (node) => node instanceof Source && !node.disconnects,
        ).length <= 48,
      );
    }
    const count = context.nodes.length;
    h.audio.stop();
    assert.equal(h.audio.playing, false);
    assert.equal(h.intervals.size, 0);
    assert.equal(context.closes, 1);
    assert.ok(context.nodes.every((node) => node.disconnects === 1));
    assert.ok(
      context.nodes
        .filter((node) => node instanceof Source)
        .every((node) => node.stops.length >= 1),
    );
    h.tick(100);
    assert.equal(context.nodes.length, count);
    assert.equal(await h.audio.play(), true);
    assert.equal(h.contexts.length, 2);
  } finally {
    h.audio.dispose();
  }
  assert.equal(h.contexts[1].closes, 1);
  assert.equal(h.intervals.size, 0);
  assert.equal(await h.audio.play(), false);
});

test("background clock jumps skip old beats and never schedule a large catch-up backlog", async () => {
  const h = harness();
  try {
    await h.audio.play();
    const context = h.contexts[0],
      count = context.nodes.length;
    h.tick(3600);
    const added = context.nodes.slice(count),
      sources = added.filter((node) => node instanceof Source);
    assert.ok(sources.length <= 7);
    assert.ok(added.length <= 21);
    assert.ok(sources.every((node) => node.starts[0] >= 3600));
    assert.equal(h.intervals.size, 1);
  } finally {
    h.audio.dispose();
  }
});

test("volume changes clamp finite values and smoothly update a master with headroom", async () => {
  const h = harness();
  try {
    h.audio.setVolume(5);
    assert.equal(h.audio.volume, 1);
    assert.equal(h.contexts.length, 0);
    await h.audio.play();
    const master = h.contexts[0].nodes[0];
    assert.equal(master.gain.value, 0.32);
    h.audio.setVolume(-5);
    assert.equal(h.audio.volume, 0);
    assert.equal(master.gain.value, 0);
    h.audio.setVolume(0.6);
    assert.equal(master.gain.value, 0.192);
    h.audio.setVolume(NaN);
    h.audio.setVolume(Infinity);
    assert.equal(h.audio.volume, 0.6);
  } finally {
    h.audio.dispose();
  }
});

test("pending Play calls share one context and stop/dispose prevent late resume from restarting audio", async () => {
  let resolve!: () => void;
  const context = new Context();
  context.pendingResume = new Promise<void>((done) => (resolve = done));
  const h = harness(() => context);
  const first = h.audio.play(),
    second = h.audio.play();
  assert.equal(first, second);
  assert.equal(h.contexts.length, 1);
  h.audio.stop();
  h.audio.dispose();
  assert.equal(context.closes, 1);
  resolve();
  assert.equal(await first, false);
  assert.equal(h.audio.playing, false);
  assert.equal(h.intervals.size, 0);
  assert.equal(context.closes, 1);
});

test("failed resume closes allocated audio and permits an explicit later retry", async () => {
  const failed = new Context();
  failed.pendingResume = Promise.reject(new Error("browser blocked"));
  let calls = 0;
  const h = harness(() => (++calls === 1 ? failed : new Context()));
  try {
    assert.equal(await h.audio.play(), false);
    assert.equal(failed.closes, 1);
    assert.equal(h.intervals.size, 0);
    assert.ok(h.audio.error);
    assert.equal(await h.audio.play(), true);
    assert.equal(h.audio.error, null);
    assert.equal(h.contexts.length, 2);
  } finally {
    h.audio.dispose();
  }
});
