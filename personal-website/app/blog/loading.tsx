export default function Loading() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <h1 className="text-4xl font-bold mb-8 tracking-tight">Blog</h1>

            <div className="space-y-8 animate-pulse">
                {[1, 2, 3].map((i) => (
                    <article key={i} className="border-b pb-8">
                        <div className="h-8 bg-muted rounded w-3/4 mb-3"></div>
                        <div className="h-4 bg-muted rounded w-full mb-2"></div>
                        <div className="h-4 bg-muted rounded w-5/6 mb-3"></div>
                        <div className="flex gap-4">
                            <div className="h-4 w-24 bg-muted rounded"></div>
                            <div className="h-4 w-16 bg-muted rounded"></div>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
