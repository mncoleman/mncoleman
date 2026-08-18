"""Synthesise the pull-chain click: four variants on the same fixed grid the key
sprite uses.

Modelled on what the object actually does rather than on "a click sound". A
pull-chain lamp switch is three events in ~150ms: the rotor snapping over its
detent, the mechanism hitting its stop a few milliseconds later, and then the
chain itself jingling as it falls back. The third one is what makes it read as a
chain rather than as a button, and it is the part a generic click sample never
has.

Synthesised rather than sampled because every light-switch recording that is
actually free carries an attribution requirement, and this way the character is
tunable and costs 48KB.

The only source of truth for `public/sounds/switch.wav` — an asset with no
recording behind it and no generator committed is one nobody can ever adjust.
Not part of the build; run it by hand when the sound needs changing:

    python3 scripts/generate-switch-sound.py && mv switch.wav public/sounds/

Needs numpy. The RNG is seeded, so a re-run with no edits reproduces the file
byte for byte.
"""

import numpy as np
import wave

SR = 32000          # brighter than the key sprite: the snap lives above 5kHz
SLICE_S = 0.19
SLICE_N = int(SR * SLICE_S)
COUNT = 4

rng = np.random.default_rng(7)   # fixed: the sprite must be reproducible


def snap(buf, at, amp, modes, decay, noise=0.5, noise_decay=0.0025):
    """One transient: a broadband tick plus a few resonant modes ringing off it."""
    start = int(at * SR)
    n = min(int(0.09 * SR), len(buf) - start)
    if n <= 0:
        return
    t = np.arange(n) / SR

    # The tick. Short enough to read as an impact rather than as a burst of hiss.
    hit = rng.standard_normal(n) * np.exp(-t / noise_decay) * noise

    # The body. Plastic and thin metal, so the modes are high and die fast.
    body = np.zeros(n)
    for freq, weight in modes:
        body += weight * np.sin(2 * np.pi * freq * t + rng.uniform(0, 6.28)) * np.exp(-t / decay)

    buf[start:start + n] += (hit + body) * amp


def variant(i):
    buf = np.zeros(SLICE_N)

    # 1. The detent letting go — the sharpest thing in the sound.
    snap(buf, 0.002, 1.0,
         [(1750 + i * 90, 0.55), (3300 + i * 140, 0.40), (5200 + i * 200, 0.22)],
         decay=0.009, noise=0.62, noise_decay=0.0022)

    # 2. The mechanism reaching its stop, a beat later and duller.
    snap(buf, 0.002 + rng.uniform(0.013, 0.021), rng.uniform(0.42, 0.58),
         [(1150 + i * 60, 0.6), (2400 + i * 90, 0.3)],
         decay=0.013, noise=0.34, noise_decay=0.0035)

    # 3. The chain settling. Quiet, irregular, and the whole reason this reads as
    #    a pull chain — take it out and it is just another button.
    for _ in range(rng.integers(3, 6)):
        snap(buf, rng.uniform(0.045, 0.15), rng.uniform(0.05, 0.13),
             [(rng.uniform(4200, 7200), 0.7), (rng.uniform(2600, 3800), 0.3)],
             decay=0.004, noise=0.5, noise_decay=0.0012)

    # Tail fade, so a slice can never click against the silence after it.
    fade = int(0.02 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)
    return buf


slices = [variant(i) for i in range(COUNT)]
peak = max(np.abs(s).max() for s in slices)
out = np.concatenate([s / peak * 0.82 for s in slices])

wave_out = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open('switch.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(wave_out.tobytes())

for i, s in enumerate(slices):
    env = np.abs(s)
    print(f'{i} peak@{int(env.argmax() / SR * 1000):2d}ms  '
          f'-20dB@{int(np.argmax(env < env.max() * 0.1) / SR * 1000):3d}ms  '
          f'energy_after_40ms={float((s[int(0.04*SR):] ** 2).sum() / (s ** 2).sum()):.3f}')
print(f'{COUNT} slices x {SLICE_N} @ {SR}Hz = {wave_out.nbytes // 1024}KB')
