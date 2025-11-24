import { getBlogStats } from '@/lib/notion';
import Link from 'next/link';
import { RefreshButton } from '@/components/refresh-button';

export const revalidate = 3600;

export default async function AdminPage() {
    const stats = await getBlogStats();

    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <h1 className="text-4xl font-bold mb-8 tracking-tight">Admin Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Posts</h3>
                    <p className="text-3xl font-bold">{stats.totalPosts}</p>
                </div>
                <div className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Words</h3>
                    <p className="text-3xl font-bold">{stats.totalWords.toLocaleString()}</p>
                </div>
                <div className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Avg Reading Time</h3>
                    <p className="text-3xl font-bold">{stats.avgReadingTime} min</p>
                </div>
            </div>

            <div className="space-y-8">
                <section className="p-6 border rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4">Analytics</h2>
                    <p className="text-muted-foreground mb-4">
                        View detailed visitor stats on Google Analytics.
                    </p>
                    <Link
                        href="https://analytics.google.com/"
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                    >
                        Open Google Analytics 4
                    </Link>
                </section>

                <section className="p-6 border rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4">CMS Management</h2>
                    <p className="text-muted-foreground mb-4">
                        Manage your content directly in Notion.
                    </p>
                    <Link
                        href="https://www.notion.so/"
                        target="_blank"
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                    >
                        Go to Notion
                    </Link>
                </section>

                <section className="p-6 border rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4">Refresh Posts</h2>
                    <p className="text-muted-foreground mb-4">
                        Trigger a rebuild to fetch the latest posts from Notion.
                        Note: Automatic daily refreshes are enabled at 6 AM UTC.
                    </p>
                    <RefreshButton />
                </section>
            </div>
        </div>
    );
}
