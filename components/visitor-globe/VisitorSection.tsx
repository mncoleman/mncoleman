'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, MapPin, Utensils, Music, X, Sparkles } from 'lucide-react';
import VisitorGlobe from './VisitorGlobe';
import VisitorWheel from './VisitorWheel';
import WhereFromDialog from './WhereFromDialog';
import { fetchPins, type Pin } from './visitor-api';

export default function VisitorSection() {
    const [pins, setPins] = useState<Pin[]>([]);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [isDesktop, setIsDesktop] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const ctrl = new AbortController();
        fetchPins(ctrl.signal)
            .then(setPins)
            .catch(() => setPins([]));
        return () => ctrl.abort();
    }, []);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const update = () => setIsDesktop(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    const onSubmitted = (pin: Pin) => {
        setPins((prev) => [pin, ...prev.filter((p) => p.id !== pin.id)]);
        setFocusedId(pin.id);
    };

    const focused = useMemo(() => pins.find((p) => p.id === focusedId) || null, [pins, focusedId]);
    const recent = useMemo(() => pins.slice(0, 12), [pins]);

    const dialog = <WhereFromDialog onSubmitted={onSubmitted} />;

    return (
        <section id="visitor-globe" className="relative z-10 px-4 py-16 md:py-24">
            <div className="mx-auto w-full max-w-5xl">
                <div className="mb-8 text-center">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                        Where&apos;s everyone from?
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {pins.length === 0
                            ? 'Be the first to drop a pin.'
                            : `${pins.length} ${pins.length === 1 ? 'visitor has' : 'visitors have'} said hi so far.`}
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-start gap-8">
                    {/* Globe */}
                    <div className="flex-1 flex flex-col items-center">
                        <div className="relative w-full max-w-[460px] aspect-square">
                            <VisitorGlobe
                                pins={pins}
                                focusedId={focusedId}
                                onSelect={(id) => setFocusedId((cur) => (cur === id ? null : id))}
                                onUserInteract={() => setFocusedId(null)}
                                className="h-full w-full"
                            />

                            {/* Focused-pin callout */}
                            {focused && (
                                <div className="glass-panel absolute inset-x-2 bottom-2 p-3 pr-9 text-left animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        type="button"
                                        onClick={() => setFocusedId(null)}
                                        aria-label="Close"
                                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                                        <MapPin className="h-3.5 w-3.5 text-primary" />
                                        {focused.name || 'A friendly visitor'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{focused.place_label}</div>
                                    {(focused.food || focused.song || focused.fact || focused.quote) && (
                                        <div className="mt-2 space-y-1.5 text-xs">
                                            {focused.food && (
                                                <div className="flex items-center gap-1.5">
                                                    <Utensils className="h-3 w-3 shrink-0 text-muted-foreground" /> {focused.food}
                                                </div>
                                            )}
                                            {focused.song && (
                                                <div className="flex items-center gap-1.5">
                                                    <Music className="h-3 w-3 shrink-0 text-muted-foreground" /> {focused.song}
                                                </div>
                                            )}
                                            {focused.fact && (
                                                <div className="flex items-start gap-1.5">
                                                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                                    <span>{focused.fact}</span>
                                                </div>
                                            )}
                                            {focused.quote && (
                                                <p className="mt-0.5 border-l-2 border-primary/40 pl-2 italic text-muted-foreground">
                                                    &ldquo;{focused.quote}&rdquo;
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Same frosting as the wheel entries — the Waves strokes run
                            straight through this line in light mode too. */}
                        <p className="mt-3 text-center">
                            <span className="inline-block rounded-full bg-background/75 px-3 py-1 text-[11px] text-muted-foreground/80 backdrop-blur-xl">
                                Drag to spin · tap a visitor below to fly there
                            </span>
                        </p>

                        {/* Recent visitors — 3D infinite auto-scrolling wheel */}
                        {recent.length > 0 && (
                            <VisitorWheel
                                pins={recent}
                                focusedId={focusedId}
                                onSelect={(id) => setFocusedId((cur) => (cur === id ? null : id))}
                                className="mt-5 w-full max-w-[240px]"
                            />
                        )}
                    </div>

                    {/* Dialog: always on desktop; toggle on mobile */}
                    <div className="w-full lg:w-[380px] lg:shrink-0">
                        {isDesktop ? (
                            dialog
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setMobileOpen((v) => !v)}
                                    className="glass-panel flex w-full items-center justify-center gap-2 px-4 py-3 font-medium"
                                >
                                    <MapPin className="h-4 w-4 text-primary" />
                                    Where are you from?
                                </button>
                                {mobileOpen && <div className="mt-3">{dialog}</div>}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
