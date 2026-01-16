import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // basePath removed for custom domain (mncoleman.com)
  // Previously: '/matthew-coleman' for GitHub Pages subpath
  trailingSlash: true,
};

export default nextConfig;
