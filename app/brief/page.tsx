import { BriefEdition } from '@/components/brief/BriefEdition';
import { briefMetadata } from './brief-config';

export const metadata = briefMetadata('Daily Brief', '/brief');

/** /brief shows the newest edition. It does not redirect: the site is a static export, and the newest date is only known at view time. */
export default function BriefPage() {
    return <BriefEdition date="latest" />;
}
