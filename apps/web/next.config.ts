import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@mango/ui', '@mango/core', '@mango/db'],
};

export default config;
