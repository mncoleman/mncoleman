'use client';

import { ReactLenis, useLenis, type LenisRef } from 'lenis/react';
import 'lenis/dist/lenis.css';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'scroll-prefs';

export interface ScrollPrefs {
  /** 0 = snappy, 100 = floaty. Mapped onto Lenis' `lerp` (see `lerpFor`). */
  smoothness: number;
  /** How far one wheel notch travels. Lenis' `wheelMultiplier`. */
  strength: number;
  /** Off falls back to the browser's native, instant wheel scrolling. */
  smoothWheel: boolean;
}

export const SCROLL_DEFAULTS: ScrollPrefs = {
  smoothness: 60,
  strength: 1,
  smoothWheel: true,
};

/**
 * Smoothness reads left-to-right as "more smooth", but Lenis' `lerp` runs the
 * other way — it's the fraction of the remaining distance covered each frame,
 * so *smaller* is slower and floatier.
 */
export const lerpFor = (smoothness: number) =>
  0.22 - (Math.min(100, Math.max(0, smoothness)) / 100) * 0.19;

interface ScrollPrefsValue extends ScrollPrefs {
  set: (patch: Partial<ScrollPrefs>) => void;
  reset: () => void;
  /** False when Lenis isn't running at all (reduced motion). */
  active: boolean;
}

const ScrollPrefsContext = createContext<ScrollPrefsValue>({
  ...SCROLL_DEFAULTS,
  set: () => {},
  reset: () => {},
  active: false,
});

export const useScrollPrefs = () => useContext(ScrollPrefsContext);

function readStored(): ScrollPrefs {
  if (typeof window === 'undefined') return SCROLL_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SCROLL_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ScrollPrefs>;
    return {
      smoothness:
        typeof parsed.smoothness === 'number'
          ? parsed.smoothness
          : SCROLL_DEFAULTS.smoothness,
      strength:
        typeof parsed.strength === 'number'
          ? parsed.strength
          : SCROLL_DEFAULTS.strength,
      smoothWheel:
        typeof parsed.smoothWheel === 'boolean'
          ? parsed.smoothWheel
          : SCROLL_DEFAULTS.smoothWheel,
    };
  } catch {
    return SCROLL_DEFAULTS;
  }
}

/**
 * Site-wide smooth scrolling.
 *
 * Lenis 1.x scrolls the *real* document (no transform wrapper), so `position:
 * sticky` (the header), `position: fixed` (Dark Veil, the scroll cue) and every
 * `window.scrollY` reader keep working untouched.
 *
 * Nested scrollers (modals, code blocks, the visitor wheel, ScrollStack) must
 * carry `data-lenis-prevent` or Lenis eats their wheel events and scrolls the
 * page instead.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  // Both resolved during the first client render, not in an effect: flipping the
  // branch below afterwards would swap the element type wrapping `children` and
  // remount the whole app — tearing down and re-initialising Dark Veil's WebGL
  // context and the globe one frame after first paint. Neither reads any DOM, so
  // hydration is unaffected (<ReactLenis root> renders a context provider and no
  // markup, so the tree is identical either way).
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [prefs, setPrefs] = useState<ScrollPrefs>(readStored);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const persist = useCallback((next: ScrollPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal: the settings still apply for this session */
    }
  }, []);

  const value = useMemo<ScrollPrefsValue>(
    () => ({
      ...prefs,
      active: !reduced,
      set: (patch) => persist({ ...prefs, ...patch }),
      reset: () => persist(SCROLL_DEFAULTS),
    }),
    [prefs, reduced, persist]
  );

  return (
    <ScrollPrefsContext.Provider value={value}>
      {reduced ? children : <LenisRoot prefs={prefs}>{children}</LenisRoot>}
    </ScrollPrefsContext.Provider>
  );
}

function LenisRoot({ prefs, children }: { prefs: ScrollPrefs; children: ReactNode }) {
  // lenis/react re-creates the instance whenever `options` changes by value, so
  // the live prefs must NOT go in here — dragging a slider would tear down and
  // rebuild Lenis on every frame. Freeze the mount-time values (lazy state, so
  // it never re-initialises) and push later changes onto the running instance.
  const [initial] = useState(prefs);
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    const lenis = lenisRef.current?.lenis;
    if (!lenis) return;
    lenis.options.lerp = lerpFor(prefs.smoothness);
    lenis.options.wheelMultiplier = prefs.strength;
    lenis.options.smoothWheel = prefs.smoothWheel;
  }, [prefs]);

  return (
    <ReactLenis
      root
      ref={lenisRef}
      options={{
        lerp: lerpFor(initial.smoothness),
        wheelMultiplier: initial.strength,
        smoothWheel: initial.smoothWheel,
        // Native touch scrolling on mobile: syncing it costs more than it buys
        // and fights the visitor wheel's own gesture handling.
        syncTouch: false,
      }}
    >
      <ScrollReset />
      {children}
    </ReactLenis>
  );
}

/**
 * App Router resets `window.scrollY` on navigation, but Lenis keeps its own
 * animated position — without this the next wheel tick snaps you back to where
 * you were on the previous page.
 *
 * Deliberate tradeoff: this also forgoes scroll restoration on back/forward.
 * Landing at the top beats landing at a stale offset that Lenis then yanks away.
 */
function ScrollReset() {
  const pathname = usePathname();
  const lenis = useLenis();
  // The effect also re-runs when `lenis` first becomes available, and Next syncs
  // `history.replaceState` into the router — so a page that writes a hash on
  // click (the brand kit's tabs) can re-run this with the path unchanged. Reset
  // only on a real path change, or those turn into a yank back to the top.
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    if (previous === null || previous === pathname) return;
    lenis?.scrollTo(0, { immediate: true, force: true });
  }, [pathname, lenis]);

  return null;
}

/**
 * Scroll to an element through Lenis when it's running, falling back to the
 * native smooth scroll when it isn't (reduced motion).
 */
export function useSmoothScrollTo() {
  const lenis = useLenis();

  return useCallback(
    (target: string | HTMLElement, offset = 0) => {
      if (lenis) {
        lenis.scrollTo(target, { offset });
        return;
      }
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      el?.scrollIntoView({ behavior: 'smooth' });
    },
    [lenis]
  );
}
