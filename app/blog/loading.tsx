// Mirrors BlogPageClient's layout (centred header, filter row, two-column cards) so the
// page settles into place instead of jumping. The heading is left blank on purpose:
// a plain "Blog" here would flash in a different style before the masked heading.
export default function Loading() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-5xl" aria-busy="true">
            <span className="sr-only">Loading blog…</span>

            <div className="mb-12 flex flex-col items-center animate-pulse">
                <div className="h-[107px]" />
                <div className="mt-3 mb-6 h-7 w-full max-w-xl rounded bg-muted" />
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-9 w-24 rounded-full bg-muted" />
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 animate-pulse md:grid-cols-2">
                {[1, 2].map((i) => (
                    <div key={i} className="h-[300px] rounded-xl border bg-muted/40" />
                ))}
            </div>
        </div>
    );
}
