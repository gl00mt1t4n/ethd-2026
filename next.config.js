/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        // Prevent Webpack from aggressively checking missing @next/swc optional dependencies
        config.snapshot = {
            ...(config.snapshot || {}),
            managedPaths: [/^(.+?[\\/]node_modules[\\/])(?!@next[\\/]swc-)/],
        };
        return config;
    },
};

module.exports = nextConfig;
