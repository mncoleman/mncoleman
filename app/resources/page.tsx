import { getPublishedResources } from '@/lib/resources';
import ResourcesPageClient from './ResourcesPageClient';

export const metadata = {
    title: "Resources | Matthew Coleman",
    description: "A curated collection of useful websites, tools, and resources.",
};

export default async function ResourcesPage() {
    const resources = await getPublishedResources();

    return <ResourcesPageClient initialResources={resources} />;
}
