/**
 * The site's click sound: one mechanical-keyboard sample per click, never quite
 * the same twice.
 *
 * `public/sounds/keys.wav` is a sprite of 14 key presses laid on a fixed 190ms
 * grid, cut from the CherryMX Black recording that the Aceternity keyboard
 * component uses (a Mechvibes community pack). A fixed grid rather than an
 * offset table is deliberate: the player needs a slice index and nothing else,
 * so there is no second file to keep in sync with the audio.
 *
 * It is PCM rather than something an order of magnitude smaller because lossy
 * codecs prepend priming samples, which would shift every slice off its slot by
 * a variable, decoder-dependent amount. 115KB fetched once on an idle callback
 * and cached immutably is the cheaper problem.
 *
 * Cost per click is one AudioBufferSourceNode: no allocation beyond the node,
 * no decoding, no network. The variety comes from jitter, not from sample count
 * — 14 slices with a randomised rate and gain never audibly repeat.
 */

const SPRITE_URL = '/sounds/keys.wav';
const SLICES = 14;
const SLICE_S = 0.19;

/** Master level. The pack is normalised loud; this is what makes it UI-quiet. */
const VOLUME = 0.3;

/** Semitone-ish detune, and a little level variation, applied per click. */
const RATE_JITTER = 0.07;
const GAIN_JITTER = 0.22;

/**
 * A rapid double-click should sound like two presses, but a stray burst of
 * events must not turn into a wall of sound. Both guards are cheap and only one
 * of them normally fires.
 */
const MIN_GAP_MS = 30;
const MAX_VOICES = 6;

const STORAGE_KEY = 'click-sound';

let bytes: Promise<ArrayBuffer> | null = null;
let buffer: AudioBuffer | null = null;
let decoding: Promise<void> | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let lastAt = 0;
let lastSlice = -1;
let voices = 0;

let muted = false;
const listeners = new Set<() => void>();

/**
 * Fetch and decode ahead of the first click, without creating a live
 * AudioContext.
 *
 * The split matters: an AudioContext constructed outside a user gesture starts
 * suspended and logs an autoplay warning, but `OfflineAudioContext` carries no
 * such policy and decodes perfectly well. Doing it this way means the first
 * click a visitor makes is audible, rather than being the one that pays for the
 * download.
 */
export function preloadClickSound() {
    if (bytes) return;
    bytes = fetch(SPRITE_URL).then((r) => {
        if (!r.ok) throw new Error(`click sound: ${r.status}`);
        return r.arrayBuffer();
    });

    decoding = bytes
        .then((raw) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(raw))
        .then((decoded) => {
            buffer = decoded;
        })
        .catch(() => {
            // A missing or undecodable sprite silences the feature and nothing
            // else. There is no fallback worth having and nothing to report.
            buffer = null;
        });
}

/** Create the live context. Must be called from inside a user gesture. */
function wake() {
    if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor({ latencyHint: 'interactive' });
        master = ctx.createGain();
        master.gain.value = VOLUME;
        master.connect(ctx.destination);
    }
    // Chrome suspends the context whenever it likes (a tab returning from the
    // background is the common one), so this is not just first-run setup.
    if (ctx.state === 'suspended') void ctx.resume();
}

/**
 * Play one click. Safe to call from any event handler; does nothing when muted,
 * when the sprite has not arrived, or when the guards above say so.
 */
export function playClick() {
    if (muted || typeof window === 'undefined') return;

    const now = performance.now();
    if (now - lastAt < MIN_GAP_MS || voices >= MAX_VOICES) return;

    preloadClickSound();
    wake();
    if (!ctx || !master || !buffer) return;

    // Never the same slice twice running: a repeat is the one thing the ear
    // picks out as a pattern, and avoiding it costs a comparison.
    let slice = (Math.random() * SLICES) | 0;
    if (slice === lastSlice) slice = (slice + 1 + ((Math.random() * (SLICES - 1)) | 0)) % SLICES;
    lastSlice = slice;
    lastAt = now;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_JITTER;

    const gain = ctx.createGain();
    gain.gain.value = 1 - Math.random() * GAIN_JITTER;

    source.connect(gain).connect(master);
    voices += 1;

    // Released by whichever comes first. `onended` alone is not enough: a
    // suspended context never ends anything, so a few clicks made while the tab
    // was in the background would pin the counter at the cap and silence the
    // feature permanently. Timers are throttled but never stopped, so the
    // timeout always lands — the same guard `components/ui/count-up.tsx` needs
    // for the same reason.
    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        voices -= 1;
        source.disconnect();
        gain.disconnect();
    };
    source.onended = release;
    window.setTimeout(release, SLICE_S * 1000 + 400);

    source.start(0, slice * SLICE_S, SLICE_S);
}

/* -------------------------------------------------------------------------- */
/* Mute, as a store rather than React state — every click reads it, and nothing */
/* about it should be able to trigger a render of anything but the toggle.      */
/* -------------------------------------------------------------------------- */

export function isMuted() {
    return muted;
}

export function setMuted(next: boolean) {
    if (next === muted) return;
    muted = next;
    try {
        localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
    } catch {
        // Private mode. The preference just does not survive the session.
    }
    listeners.forEach((fn) => fn());
}

export function subscribeMuted(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Read the stored preference. Default is ON — the feature is the point. */
export function restoreMuted() {
    try {
        muted = localStorage.getItem(STORAGE_KEY) === 'off';
    } catch {
        muted = false;
    }
    listeners.forEach((fn) => fn());
}
