'use client';

import { useRef, useState } from 'react';
import { Delete } from 'lucide-react';

/**
 * Rotary-phone letter dial for text mini-captcha answers. The alphabet sits
 * around a circle; the visitor DRAGS the selector around the ring and each
 * letter swells as the selector passes over it. Releasing commits the letter
 * under the selector and the selector springs back to "A" at the top, exactly
 * like a rotary dial returning.
 *
 * There is deliberately no keyboard text entry: a letter can only be *dialed*.
 * Headless bots can synthesize a keystroke or a click trivially, but a
 * continuous circular pointer drag is real work — which is the whole point.
 * Arrow keys + Enter are still wired up so the dial stays operable by keyboard
 * for accessibility.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const STEP = 360 / LETTERS.length;
const MAX_LEN = 12;

// Geometry (px) of the dial face.
const SIZE = 224;
const CENTER = SIZE / 2;
const LETTER_R = 82; // radius the letters sit on
const HANDLE_R = 82; // radius the selector rides on

const RETURN_EASE = 'transform 0.3s cubic-bezier(0.32, 1.5, 0.62, 1)';

interface Props {
    onChange: (word: string) => void;
    className?: string;
}

/** Shortest angular distance between two headings, in degrees (0–180). */
function angleDelta(a: number, b: number): number {
    const d = Math.abs(((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
}

export default function CaptchaRotary({ onChange, className }: Props) {
    const faceRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const wordRef = useRef('');

    const [angle, setAngle] = useState(0); // 0 = selector parked on "A" at the top
    const [dragging, setDragging] = useState(false);
    const [word, setWord] = useState('');
    const [justAdded, setJustAdded] = useState<number | null>(null);

    const activeIndex = Math.round(angle / STEP) % LETTERS.length;

    const commit = (next: string) => {
        wordRef.current = next;
        setWord(next);
        onChange(next);
    };

    // Heading (deg, 0 = up, clockwise) of a pointer position around the face.
    const clientToAngle = (clientX: number, clientY: number) => {
        const rect = faceRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);
        const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        return (deg + 360) % 360;
    };

    const startDrag = (e: React.PointerEvent) => {
        e.preventDefault();
        if (wordRef.current.length >= MAX_LEN) return;
        draggingRef.current = true;
        movedRef.current = false;
        setDragging(true); // transition off → the selector follows the finger 1:1

        const move = (ev: PointerEvent) => {
            if (!draggingRef.current) return;
            const a = clientToAngle(ev.clientX, ev.clientY);
            // Require a real sweep, not a twitch, before this counts as a dial.
            if (angleDelta(a, 0) > STEP / 2) movedRef.current = true;
            setAngle(a);
        };
        const up = (ev: PointerEvent) => {
            draggingRef.current = false;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            const landed = Math.round(clientToAngle(ev.clientX, ev.clientY) / STEP) % LETTERS.length;
            setDragging(false); // transition back on → the dial springs home
            setAngle(0);
            if (movedRef.current) {
                const next = (wordRef.current + LETTERS[landed]).slice(0, MAX_LEN);
                commit(next);
                setJustAdded(next.length - 1);
                setTimeout(() => setJustAdded(null), 320);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            setDragging(true);
            setAngle((a) => (Math.round(a / STEP) * STEP + STEP + 360) % 360);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            setDragging(true);
            setAngle((a) => (Math.round(a / STEP) * STEP - STEP + 360) % 360);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (wordRef.current.length >= MAX_LEN) return;
            commit((wordRef.current + LETTERS[activeIndex]).slice(0, MAX_LEN));
            setDragging(false);
            setAngle(0);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            commit(wordRef.current.slice(0, -1));
        }
    };

    const transition = dragging ? 'none' : RETURN_EASE;

    return (
        <div className={className}>
            <div className="mb-2 text-xs text-muted-foreground">
                Drag the dial to a letter and let go — no typing.
            </div>

            <div className="flex flex-col items-center gap-3">
                <div
                    ref={faceRef}
                    className="relative select-none touch-none"
                    style={{ width: SIZE, height: SIZE }}
                >
                    {/* No dial face or arm — the ring of letters and the knob riding it
                        are the whole affordance. */}

                    {/* letters */}
                    {LETTERS.map((ch, i) => {
                        const a = i * STEP;
                        const d = angleDelta(a, angle) / STEP; // distance in letter-steps
                        const near = Math.max(0, 1 - d / 1.7);
                        const scale = 1 + near * 1.15;
                        const rad = ((a - 90) * Math.PI) / 180;
                        const x = CENTER + LETTER_R * Math.cos(rad);
                        const y = CENTER + LETTER_R * Math.sin(rad);
                        return (
                            <span
                                key={ch}
                                aria-hidden="true"
                                className="absolute font-mono text-[13px] leading-none"
                                style={{
                                    left: x,
                                    top: y,
                                    transform: `translate(-50%, -50%) scale(${scale})`,
                                    transition: dragging ? 'none' : 'transform 0.3s ease, color 0.3s ease',
                                    color:
                                        near > 0.85
                                            ? 'hsl(var(--primary))'
                                            : near > 0.2
                                              ? 'hsl(var(--foreground))'
                                              : 'hsl(var(--muted-foreground))',
                                    fontWeight: near > 0.85 ? 700 : 400,
                                }}
                            >
                                {ch}
                            </span>
                        );
                    })}

                    {/* selector knob — purely visual; the wrapper rotates so it rides the ring */}
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{ transform: `rotate(${angle}deg)`, transition }}
                        aria-hidden="true"
                    >
                        <div
                            className="absolute left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background shadow"
                            style={{ top: CENTER - HANDLE_R }}
                        >
                            <span
                                className="block font-mono text-sm font-bold text-primary"
                                style={{ transform: `rotate(${-angle}deg)`, transition }}
                            >
                                {LETTERS[activeIndex]}
                            </span>
                        </div>
                    </div>

                    {/* The grab target stays parked at the top ("A"), so a press always
                        catches the dial even while the knob is still springing home. */}
                    <button
                        type="button"
                        role="slider"
                        aria-label="Rotary letter dial"
                        aria-valuemin={0}
                        aria-valuemax={LETTERS.length - 1}
                        aria-valuenow={activeIndex}
                        aria-valuetext={LETTERS[activeIndex]}
                        onPointerDown={startDrag}
                        onKeyDown={onKeyDown}
                        className="absolute left-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        style={{ top: CENTER - HANDLE_R }}
                    />
                </div>

                {/* what has been dialed so far */}
                <div className="flex items-center gap-2">
                    <div className="flex min-h-[38px] min-w-[132px] items-center justify-center gap-1 rounded-md border border-border/50 bg-background/40 px-2 py-1.5">
                        {word ? (
                            word.split('').map((ch, i) => (
                                <span
                                    key={i}
                                    className="font-mono text-base font-semibold"
                                    style={{
                                        transform: justAdded === i ? 'scale(1.35)' : 'scale(1)',
                                        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                    }}
                                >
                                    {ch}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-muted-foreground/70">Dial your answer…</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => commit(word.slice(0, -1))}
                        disabled={!word}
                        aria-label="Delete last dialed letter"
                        className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
                    >
                        <Delete className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
