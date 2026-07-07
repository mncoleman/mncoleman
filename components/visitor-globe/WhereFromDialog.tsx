'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Loader2, Check, ChevronDown, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    fetchChallenge,
    geocode,
    submitPin,
    type Challenge,
    type GeoResult,
    type Pin,
} from './visitor-api';
import CaptchaSlider from './CaptchaSlider';
import CaptchaSolar from './CaptchaSolar';

const FACT_MAX = 200;

interface Props {
    onSubmitted: (pin: Pin) => void;
    className?: string;
}

export default function WhereFromDialog({ onSubmitted, className }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<GeoResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [selected, setSelected] = useState<GeoResult | null>(null);

    const [showOptional, setShowOptional] = useState(true);
    const [name, setName] = useState('');
    const [food, setFood] = useState('');
    const [song, setSong] = useState('');
    const [fact, setFact] = useState('');

    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [captchaAnswer, setCaptchaAnswer] = useState('');
    const honeypotRef = useRef<HTMLInputElement>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<Pin | null>(null);

    const loadChallenge = () => {
        fetchChallenge()
            .then((c) => {
                setChallenge(c);
                setCaptchaAnswer('');
            })
            .catch(() => setChallenge(null));
    };

    useEffect(() => {
        loadChallenge();
    }, []);

    // Debounced Geoapify autocomplete.
    useEffect(() => {
        if (selected && query === selected.label) return; // don't re-search a picked value
        if (query.trim().length < 2) {
            setResults([]);
            setShowResults(false);
            return;
        }
        const ctrl = new AbortController();
        setSearching(true);
        const t = setTimeout(async () => {
            try {
                const r = await geocode(query.trim(), ctrl.signal);
                setResults(r);
                setShowResults(true);
            } catch {
                /* aborted / ignored */
            } finally {
                setSearching(false);
            }
        }, 320);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const pick = (r: GeoResult) => {
        setSelected(r);
        setQuery(r.label);
        setResults([]);
        setShowResults(false);
        setError(null);
    };

    const reset = () => {
        setQuery('');
        setResults([]);
        setSelected(null);
        setName('');
        setFood('');
        setSong('');
        setFact('');
        setShowOptional(false);
        setDone(null);
        setError(null);
        loadChallenge();
    };

    const submit = async () => {
        if (!selected) {
            setError('Search for and pick a location first.');
            return;
        }
        if (!challenge) {
            setError('One sec—still loading. Try again in a moment.');
            loadChallenge();
            return;
        }
        if (!captchaAnswer.trim()) {
            setError('Answer the quick puzzle so we know you are human. 🤖');
            return;
        }
        setSubmitting(true);
        setError(null);
        const res = await submitPin({
            token: challenge.token,
            captchaId: challenge.captcha.id,
            captchaSig: challenge.captchaSig,
            captchaAnswer: captchaAnswer.trim(),
            honeypotField: challenge.honeypotField,
            honeypotValue: honeypotRef.current?.value || '',
            lat: selected.lat,
            lng: selected.lng,
            place_label: selected.label,
            country: selected.country,
            precision: selected.precision,
            name: name.trim() || undefined,
            food: food.trim() || undefined,
            song: song.trim() || undefined,
            fact: fact.trim() || undefined,
        });
        setSubmitting(false);

        if (res.ok && res.pin) {
            setDone(res.pin);
            onSubmitted(res.pin);
            return;
        }
        // Recoverable failures: refresh the challenge so the next attempt is clean.
        setError(res.error || 'Something went sideways—please try again.');
        loadChallenge();
    };

    if (done) {
        return (
            <div className={cn('glass-panel p-6', className)}>
                <div className="flex flex-col items-center text-center gap-3 py-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-bold">You&apos;re on the map! 📍</h3>
                    <p className="text-sm text-muted-foreground">
                        Thanks for saying hi from{' '}
                        <span className="text-foreground font-medium">{done.place_label}</span>. Your pin is
                        live on the globe.
                    </p>
                    <Button variant="outline" size="sm" onClick={reset} className="mt-1">
                        Add another
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={cn('glass-panel p-6', className)}>
            <div className="mb-4">
                <h3 className="text-lg font-bold tracking-tight">Where are you from?</h3>
                <p className="text-sm text-muted-foreground">
                    Drop a pin on the globe and say hello. 🌍
                </p>
            </div>

            {/* Location search */}
            <div className="relative">
                <Label htmlFor="vg-search" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                    Your location
                </Label>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="vg-search"
                        // Deliberately non-address-shaped name + password-manager opt-outs:
                        // Chrome/1Password/LastPass ignore autoComplete="off" for fields that
                        // look like address inputs, and this is a PUBLIC form — we never want a
                        // saved home address auto-filled here.
                        name="vg-place-lookup"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelected(null);
                        }}
                        onFocus={() => results.length > 0 && setShowResults(true)}
                        placeholder="Country, city, or full address…"
                        className="pl-9 pr-9"
                        role="combobox"
                        aria-expanded={showResults}
                        aria-autocomplete="list"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                    />
                    {searching && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                    {!searching && selected && (
                        <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                    )}
                </div>

                {showResults && results.length > 0 && (
                    <ul className="glass-panel absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg p-1 text-sm shadow-xl">
                        {results.map((r, i) => (
                            <li key={`${r.lat},${r.lng},${i}`}>
                                <button
                                    type="button"
                                    onClick={() => pick(r)}
                                    className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-primary/10 transition-colors"
                                >
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="leading-snug">{r.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Optional fields */}
            <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                className="mt-4 flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Tell us a bit about you (optional)
                </span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', showOptional && 'rotate-180')} />
            </button>

            {showOptional && (
                <div className="mt-3 space-y-3">
                    <div>
                        <Label htmlFor="vg-name" className="mb-1 block text-xs text-muted-foreground">
                            Name
                        </Label>
                        <Input id="vg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="What should we call you?" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="vg-food" className="mb-1 block text-xs text-muted-foreground">
                                Favorite food
                            </Label>
                            <Input id="vg-food" value={food} onChange={(e) => setFood(e.target.value)} maxLength={80} placeholder="Sfogliatelle" />
                        </div>
                        <div>
                            <Label htmlFor="vg-song" className="mb-1 block text-xs text-muted-foreground">
                                Favorite song
                            </Label>
                            <Input id="vg-song" value={song} onChange={(e) => setSong(e.target.value)} maxLength={120} placeholder="On repeat lately…" />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="vg-fact" className="mb-1 block text-xs text-muted-foreground">
                            A random fact about you
                        </Label>
                        <Textarea
                            id="vg-fact"
                            value={fact}
                            onChange={(e) => setFact(e.target.value.slice(0, FACT_MAX))}
                            maxLength={FACT_MAX}
                            rows={2}
                            placeholder="Surprise us with something fun about you."
                        />
                        <div className="mt-1 text-right text-[11px] text-muted-foreground/70">
                            {fact.length}/{FACT_MAX}
                        </div>
                    </div>
                </div>
            )}

            {/* Honeypot — visually hidden, off-screen; real people never fill it. */}
            {challenge && (
                <input
                    ref={honeypotRef}
                    type="text"
                    name={challenge.honeypotField}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />
            )}

            {/* Branded mini-captcha */}
            <div className="mt-4 rounded-lg border border-border/40 bg-background/30 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-primary/15 text-[10px] text-primary">
                        ?
                    </span>
                    Quick human check
                </div>
                {challenge ? (
                    <>
                        <p className="mb-2 text-sm">{challenge.captcha.prompt}</p>
                        {challenge.captcha.type === 'slider' ? (
                            <CaptchaSlider
                                key={challenge.captcha.id + challenge.token}
                                min={challenge.captcha.min}
                                max={challenge.captcha.max}
                                onChange={(n) => setCaptchaAnswer(String(n))}
                            />
                        ) : challenge.captcha.type === 'solar' ? (
                            <CaptchaSolar
                                key={challenge.captcha.id + challenge.token}
                                onChange={(planet) => setCaptchaAnswer(planet)}
                            />
                        ) : challenge.captcha.choices ? (
                            <div className="flex flex-wrap gap-2">
                                {challenge.captcha.choices.map((choice) => (
                                    <button
                                        key={choice}
                                        type="button"
                                        onClick={() => setCaptchaAnswer(choice)}
                                        className={cn(
                                            'rounded-md border px-3 py-1.5 text-sm transition-colors',
                                            captchaAnswer === choice
                                                ? 'border-primary bg-primary/15 text-foreground'
                                                : 'border-border/50 hover:border-primary/50 hover:bg-primary/5'
                                        )}
                                    >
                                        {choice}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <Input
                                value={captchaAnswer}
                                onChange={(e) => setCaptchaAnswer(e.target.value)}
                                placeholder="Your answer"
                                className="max-w-[180px]"
                                autoComplete="off"
                            />
                        )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">Loading a puzzle…</p>
                )}
            </div>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <Button onClick={submit} disabled={submitting} className="mt-4 w-full">
                {submitting ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Dropping your pin…
                    </>
                ) : (
                    <>
                        <MapPin className="h-4 w-4" /> Add me to the globe
                    </>
                )}
            </Button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/70">
                Search by{' '}
                <a
                    href="https://www.geoapify.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                >
                    Geoapify
                </a>
                . We store your pin + anything you share here publicly, and a one-way hash of your IP to
                curb spam. No exact addresses required.
            </p>
        </div>
    );
}
