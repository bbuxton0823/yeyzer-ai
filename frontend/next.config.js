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
        destination: `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}/api/auth/:path*`,
      },
      {
        source: '/api/profile/:path*',
        destination: `${process.env.NEXT_PUBLIC_PROFILE_SERVICE_URL}/api/profile/:path*`,
      },
      {
        source: '/api/matches/:path*',
        destination: `${process.env.NEXT_PUBLIC_MATCH_ENGINE_URL}/api/matches/:path*`,
      },
      {
        source: '/api/icebreakers/:path*',
        destination: `${process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL}/api/icebreakers/:path*`,
      },
      {
        source: '/api/chats/:path*',
        destination: `${process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL}/api/chats/:path*`,
      },
      {
        source: '/api/venues/:path*',
        destination: `${process.env.NEXT_PUBLIC_VENUE_SERVICE_URL}/api/venues/:path*`,
      },
      {
        source: '/api/voice/:path*',
        destination: `${process.env.NEXT_PUBLIC_VOICE_SERVICE_URL}/api/voice/:path*`,
      },
      {
        source: '/api/safety/:path*',
        destination: `${process.env.NEXT_PUBLIC_SAFETY_SERVICE_URL}/api/safety/:path*`,
      },
      // GraphQL endpoint for Profile Service
      {
        source: '/graphql',
        destination: `${process.env.NEXT_PUBLIC_PROFILE_SERVICE_URL}/graphql`,
      },
    ];
  },
};

module.exports = nextConfig;