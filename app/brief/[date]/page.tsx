import { BriefEdition } from '@/components/brief/BriefEdition';
import { BRIEF_DAYS_AHEAD, BRIEF_FIRST_DATE, briefMetadata } from '../brief-config';

/**
 * /brief/YYYY-MM-DD. The site is a static export and editions live in KV, so
 * the build cannot know which dates have one. Instead every date in a rolling
 * window gets the same small shell, which loads its edition (or says there is
 * none). The daily rebuild moves the window forward.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    const out: { date: string }[] = [];
    const end = Date.now() + BRIEF_DAYS_AHEAD * 86_400_000;
    for (let t = Date.parse(`${BRIEF_FIRST_DATE}T00:00:00Z`); t <= end; t += 86_400_000) out.push({ date: new Date(t).toISOString().slice(0, 10) });
    return out;
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
    const { date } = await params;
    return briefMetadata(`Daily Brief, ${date}`, `/brief/${date}`);
}

export default async function BriefDatePage({ params }: { params: Promise<{ date: string }> }) {
    const { date } = await params;
    return <BriefEdition date={date} />;
}
