import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const basePath = process.env.NODE_ENV === 'production' ? '/matthew-coleman' : '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Matthew Coleman - Personal Website & Blog',
    short_name: 'MC Blog',
    description: 'Personal website and blog by Matthew Coleman',
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
