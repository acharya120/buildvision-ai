/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is run separately with `npm run lint` so a style warning can never block a deploy.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["three"],
};

export default nextConfig;
