import { getPublishedProjects } from '@/lib/projects';
import ProjectsPageClient from './ProjectsPageClient';

export const metadata = {
    title: "Things I've Made (Probably with AI) | Matthew Coleman",
    description: "A showcase of projects, experiments, and tools built by Matthew Coleman.",
};

export default async function ProjectsPage() {
    const projects = await getPublishedProjects();

    return <ProjectsPageClient projects={projects} />;
}
