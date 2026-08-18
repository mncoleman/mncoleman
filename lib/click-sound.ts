/**
 * The site's interface sounds: a mechanical key press for anything clickable, a
 * pull-chain snap for the lamp that switches the theme. Never quite the same
 * twice in either case.
 *
 * Both sprites are laid on the same fixed 190ms grid, so playback needs a slice
 * index and nothing else — there is no offset table to keep in sync with the
 * audio. `keys.wav` is 14 presses cut from the CherryMX Black recording behind
 * the Aceternity keyboard component (a Mechvibes community pack); `switch.wav`
 * is 4 synthesised chain pulls (see `scripts` note in CLAUDE.md — every free
 * light-switch recording carries an attribution requirement, and synthesis also
 * meant the chain jingle could be built in).
 *
 * They are PCM rather than something an order of magnitude smaller because
 * lossy codecs prepend priming samples, which would shift every slice off its
 * slot by a variable, decoder-dependent amount. 160KB fetched once on an idle
 * callback and cached immutably is the cheaper problem.
 *
 * Cost per sound is one AudioBufferSourceNode: no allocation beyond the node,
 * no decoding, no network. The variety comes from jitter, not from sample count
 * — 14 slices with a randomised rate and gain never audibly repeat.
 */

const SLICE_S = 0.19;

type SpriteName = 'keys' | 'switch';

const SPRITES: Record<SpriteName, { url: string; slices: number; volume: number }> = {
    // Volumes differ because the sources do. The key pack is normalised loud and
    // fires constantly; the chain fires once per theme change and can afford to
    // be the more present of the two.
    keys: { url: '/sounds/keys.wav', slices: 14, volume: 0.3 },
    switch: { url: '/sounds/switch.wav', slices: 4, volume: 0.42 },
};

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

const buffers: Partial<Record<SpriteName, AudioBuffer>> = {};
const lastSlice: Record<string, number> = {};
let loading = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let lastAt = 0;
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
    if (loading) return;
    loading = true;

    const decoder = new OfflineAudioContext(1, 1, 44100);
    (Object.keys(SPRITES) as SpriteName[]).forEach((name) => {
        fetch(SPRITES[name].url)
            .then((r) => {
                if (!r.ok) throw new Error(`${name}: ${r.status}`);
                return r.arrayBuffer();
            })
            .then((raw) => decoder.decodeAudioData(raw))
            .then((decoded) => {
                buffers[name] = decoded;
            })
            .catch(() => {
                // A missing or undecodable sprite silences that one sound and
                // nothing else. There is no fallback worth having and nothing
                // to report.
            });
    });
}

/** Create the live context. Must be called from inside a user gesture. */
function wake() {
    if (!ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor({ latencyHint: 'interactive' });
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
    }
    // Chrome suspends the context whenever it likes (a tab returning from the
    // background is the common one), so this is not just first-run setup.
    if (ctx.state === 'suspended') void ctx.resume();
}

/**
 * Play one sound from a sprite. Safe to call from any event handler; does
 * nothing when muted, when the sprite has not arrived, or when the guards above
 * say so.
 */
function play(name: SpriteName, level = 1) {
    if (muted || typeof window === 'undefined') return;

    const now = performance.now();
    if (now - lastAt < MIN_GAP_MS || voices >= MAX_VOICES) return;

    preloadClickSound();
    wake();
    const buffer = buffers[name];
    if (!ctx || !master || !buffer) return;

    const { slices, volume } = SPRITES[name];

    // Never the same slice twice running: a repeat is the one thing the ear
    // picks out as a pattern, and avoiding it costs a comparison.
    let slice = (Math.random() * slices) | 0;
    if (slice === lastSlice[name]) slice = (slice + 1 + ((Math.random() * (slices - 1)) | 0)) % slices;
    lastSlice[name] = slice;
    lastAt = now;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * RATE_JITTER;

    const gain = ctx.createGain();
    gain.gain.value = volume * level * (1 - Math.random() * GAIN_JITTER);

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

/** A key press. Everything clickable, and every keystroke in the search field. */
export function playClick(level = 1) {
    play('keys', level);
}

/**
 * The pull chain on the lamp. Same snap whichever way the theme goes — a real
 * chain switch does not care which direction it is being pulled, and pitching
 * the two apart would be a sound effect rather than the object.
 */
export function playSwitch() {
    play('switch');
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
