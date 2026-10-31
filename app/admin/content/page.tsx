'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Projects and resources were one "Content" tab; they are separate sections now. */
export default function AdminContentPage() {
    const router = useRouter();
    useEffect(() => router.replace('/admin/projects'), [router]);
    return null;
}
