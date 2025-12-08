export default function Loading() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-3xl">
            <div className="animate-pulse">
                {/* Back button skeleton */}
                <div className="h-4 w-24 bg-muted rounded mb-8"></div>

                {/* Title skeleton */}
                <div className="h-10 bg-muted rounded w-3/4 mb-4"></div>

                {/* Meta info skeleton */}
                <div className="flex gap-4 mb-4">
                    <div className="h-4 w-24 bg-muted rounded"></div>
                    <div className="h-4 w-32 bg-muted rounded"></div>
                </div>

                {/* Tags skeleton */}
                <div className="flex gap-2 mb-8">
                    <div className="h-6 w-16 bg-muted rounded"></div>
                    <div className="h-6 w-20 bg-muted rounded"></div>
                </div>

                {/* Content skeleton */}
                <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-5/6"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-4/5"></div>
                </div>
            </div>
        </div>
    );
}
