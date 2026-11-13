/** @type {import('next').NextConfig} */
const isKindeConfigured = Boolean(
  process.env.KINDE_ISSUER_URL &&
    process.env.KINDE_CLIENT_ID &&
    !process.env.KINDE_ISSUER_URL.includes("<your-subdomain>")
);

const nextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },

  async redirects() {
    if (isKindeConfigured) {
      return [
        {
          source: "/sign-in",
          destination: "/api/auth/login",
          permanent: true,
        },
        {
          source: "/sign-up",
          destination: "/api/auth/register",
          permanent: true,
        },
      ];
    }
    return [];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

module.exports = nextConfig;
