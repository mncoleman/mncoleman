import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

// No basePath needed for custom domain
const basePath = '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Matthew Coleman - Information Hub',
    short_name: 'MC Hub',
    description: 'Personal information hub with blog, resources, and resume by Matthew Coleman',
    start_url: basePath || '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#18181b',
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
