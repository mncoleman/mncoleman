import { BriefArchive } from '@/components/brief/BriefArchive';
import { briefMetadata } from '../brief-config';

export const metadata = briefMetadata('Daily Brief Archive', '/brief/archive');

export default function BriefArchivePage() {
    return <BriefArchive />;
}
