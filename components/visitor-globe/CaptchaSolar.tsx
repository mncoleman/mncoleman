'use client';

import { useState } from 'react';

/**
 * Mini solar-system mini-captcha: click your home planet (Earth). A friendly,
 * on-brand visual check — humans instantly spot the blue-green marble. Planets
 * carry real aria-labels for screen-reader accessibility. Verified server-side
 * against the answer "Earth" (bound to the token), and it's only one of several
 * puzzle types, so it's charm + light friction, not the whole defense.
 */

interface Body {
    name: string;
    size: number;
    r: number; // orbit radius (px from centre)
    angle: number; // degrees
    background: string;
    ring?: boolean;
}

const BODIES: Body[] = [
    { name: 'Mercury', size: 10, r: 46, angle: 205, background: 'radial-gradient(circle at 35% 32%, #cfcfcf, #7c7c7c 70%, #4d4d4d)' },
    { name: 'Venus', size: 15, r: 66, angle: 320, background: 'radial-gradient(circle at 35% 32%, #f4e2a8, #cda94e 72%, #8f6f24)' },
    { name: 'Earth', size: 17, r: 86, angle: 112, background: 'radial-gradient(circle at 34% 30%, #a6ddff, #3b82f6 44%, #1f7a3a 74%, #0f4d24)' },
    { name: 'Mars', size: 13, r: 104, angle: 24, background: 'radial-gradient(circle at 35% 32%, #f0a273, #c0410f 72%, #7c2708)' },
];

interface Props {
    onChange: (planet: string) => void;
    className?: string;
}

export default function CaptchaSolar({ onChange, className }: Props) {
    const [picked, setPicked] = useState<string | null>(null);
    const CX = 150;
    const CY = 110;

    return (
        <div className={className}>
            <div
                className="relative mx-auto h-[220px] w-full max-w-[300px] overflow-hidden rounded-xl border border-border/40"
                style={{ background: 'radial-gradient(circle at 50% 46%, #10131f 0%, #070810 70%, #04040a 100%)' }}
            >
                {/* faint stars */}
                {[
                    [24, 30], [270, 42], [60, 180], [250, 175], [200, 24], [40, 120], [285, 120], [120, 20], [180, 195],
                ].map(([x, y], i) => (
                    <span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-white/40" style={{ left: x, top: y }} />
                ))}

                {/* orbit rings */}
                {BODIES.map((b) => (
                    <span
                        key={`orbit-${b.name}`}
                        className="absolute rounded-full border border-white/[0.06]"
                        style={{ left: CX, top: CY, width: b.r * 2, height: b.r * 2, transform: 'translate(-50%, -50%)' }}
                    />
                ))}

                {/* sun */}
                <span
                    className="absolute rounded-full"
                    style={{
                        left: CX,
                        top: CY,
                        width: 26,
                        height: 26,
                        transform: 'translate(-50%, -50%)',
                        background: 'radial-gradient(circle at 50% 45%, #fff, #ffd27a 45%, #ff9d3c 80%)',
                        boxShadow: '0 0 22px 6px rgba(255,157,60,0.45)',
                    }}
                />

                {/* planets */}
                {BODIES.map((b) => {
                    const rad = (b.angle * Math.PI) / 180;
                    const x = CX + b.r * Math.cos(rad);
                    const y = CY + b.r * Math.sin(rad);
                    const isPicked = picked === b.name;
                    return (
                        <button
                            key={b.name}
                            type="button"
                            aria-label={b.name}
                            title={b.name}
                            onClick={() => {
                                setPicked(b.name);
                                onChange(b.name);
                            }}
                            className="absolute rounded-full transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            style={{
                                left: x,
                                top: y,
                                width: b.size,
                                height: b.size,
                                transform: 'translate(-50%, -50%)',
                                background: b.background,
                                boxShadow: isPicked
                                    ? '0 0 0 3px hsl(var(--primary)), 0 0 10px 2px rgba(79,124,255,0.6)'
                                    : '0 0 4px 1px rgba(0,0,0,0.5)',
                            }}
                        />
                    );
                })}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                {picked ? `You picked ${picked}.` : 'Tap the blue-green planet.'}
            </p>
        </div>
    );
}
