import type { MetadataRoute } from 'next';

// Static export requires this route to be statically generated at build time.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/admin/'],
        },
        sitemap: 'https://mncoleman.com/sitemap.xml',
        host: 'https://mncoleman.com',
    };
}
