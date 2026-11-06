/**
 * Tiny app-wide toast store. `notify('Link copied')` from anywhere; `<Toaster />` (mounted once
 * in AdminShell) renders the latest message for a few seconds. No provider needed, so pages,
 * hooks and the post editor all share the same toast.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function notify(message: string): void {
    listeners.forEach((l) => l(message));
}

export function subscribeToasts(l: Listener): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
}
