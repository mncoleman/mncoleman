import { getResourcesByCategory } from '@/lib/resources';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export default async function ResourcesPage() {
    const resourcesByCategory = await getResourcesByCategory();
    const categories = Object.keys(resourcesByCategory).sort();

    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <h1 className="text-4xl font-bold mb-8 tracking-tight">Resources</h1>
            <p className="text-lg text-muted-foreground mb-12">
                A curated collection of useful websites, tools, and resources.
            </p>

            {categories.map(category => (
                <section key={category} className="mb-12">
                    <h2 className="text-2xl font-semibold mb-6">{category}</h2>
                    <div className="grid gap-4">
                        {resourcesByCategory[category].map(resource => (
                            <Link
                                key={resource.id}
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-4 border rounded-lg hover:bg-accent transition-colors group"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="font-medium group-hover:text-primary transition-colors">
                                            {resource.name}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {resource.description}
                                        </p>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
