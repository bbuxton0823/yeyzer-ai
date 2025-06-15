/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
        port: '',
        pathname: '/api/**',
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        port: '',
        pathname: '/api/portraits/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_AUTH_SERVICE_URL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:4002',
    NEXT_PUBLIC_PROFILE_SERVICE_URL: process.env.NEXT_PUBLIC_PROFILE_SERVICE_URL || 'http://localhost:4003',
    NEXT_PUBLIC_MATCH_ENGINE_URL: process.env.NEXT_PUBLIC_MATCH_ENGINE_URL || 'http://localhost:4004',
    NEXT_PUBLIC_CONVERSATION_SERVICE_URL: process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL || 'http://localhost:4005',
    NEXT_PUBLIC_VENUE_SERVICE_URL: process.env.NEXT_PUBLIC_VENUE_SERVICE_URL || 'http://localhost:4006',
    NEXT_PUBLIC_VOICE_SERVICE_URL: process.env.NEXT_PUBLIC_VOICE_SERVICE_URL || 'http://localhost:4007',
    NEXT_PUBLIC_SAFETY_SERVICE_URL: process.env.NEXT_PUBLIC_SAFETY_SERVICE_URL || 'http://localhost:4008',
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'http://localhost:4002/api/auth/:path*',
      },
      {
        source: '/api/profile/:path*',
        destination: 'http://localhost:4003/api/profile/:path*',
      },
      {
        source: '/api/matches/:path*',
        destination: 'http://localhost:4004/api/matches/:path*',
      },
      {
        source: '/api/icebreakers/:path*',
        destination: 'http://localhost:4005/api/icebreakers/:path*',
      },
      {
        source: '/api/chats/:path*',
        destination: 'http://localhost:4005/api/chats/:path*',
      },
      {
        source: '/api/venues/:path*',
        destination: 'http://localhost:4006/api/venues/:path*',
      },
      {
        source: '/api/voice/:path*',
        destination: 'http://localhost:4007/api/voice/:path*',
      },
      {
        source: '/api/safety/:path*',
        destination: 'http://localhost:4008/api/safety/:path*',
      },
      // GraphQL endpoint for Profile Service
      {
        source: '/graphql',
        destination: 'http://localhost:4003/graphql',
      },
    ];
  },
};

module.exports = nextConfig;