import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import morgan from 'morgan';
import { StatusCodes } from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';
import pinoHttp from 'pino-http';
import Redis from 'ioredis';
import * as geolib from 'geolib';
import {
  createPinoLogger,
  getEnv,
  getEnvBoolean,
  getEnvNumber,
  AppError,
  createErrorResponse,
  createSuccessResponse,
  asyncHandler,
  initializeMetrics,
  createMetricsMiddleware,
} from '@yeyzer/utils';
import http from 'http';

// Initialize logger
const logger = createPinoLogger('venue-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('venue_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4006); // Default to 4006
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server
const httpServer = http.createServer(app);

// Database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  min: getEnvNumber('DATABASE_POOL_MIN', 2),
  max: getEnvNumber('DATABASE_POOL_MAX', 10),
});

// Redis connection for caching
const redisClient = new Redis(getEnv('REDIS_URL', 'redis://localhost:6379'));
redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

// Reference for server instance
let server: http.Server;

// Graceful shutdown handler
const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Close database connection
        await pool.end();
        logger.info('Database connection closed');

        // Close Redis connection
        await redisClient.quit();
        logger.info('Redis connection closed');

        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Listen for shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Main async function to start everything in the correct order
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Connected to database');

    // Test Redis connection
    await redisClient.ping();
    logger.info('Connected to Redis');

    // Basic middleware setup
    app.use(httpLogger);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(compression());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // CORS configuration
    const corsOptions = {
      origin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
      credentials: true,
      optionsSuccessStatus: 200,
    };
    app.use(cors(corsOptions));

    // Request logging in development
    if (process.env.NODE_ENV !== 'production') {
      app.use(morgan('dev'));
    }

    // Metrics middleware
    app.use(createMetricsMiddleware(metrics));

    // Health check endpoints
    app.get('/health', (req, res) => {
      res.status(StatusCodes.OK).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/readyz', async (req, res) => {
      try {
        // Check database connection
        await pool.query('SELECT 1');
        
        // Check Redis connection
        await redisClient.ping();

        res.status(StatusCodes.OK).json({
          status: 'READY',
          checks: {
            database: 'UP',
            redis: 'UP'
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.error({ err }, 'Readiness check failed');
        res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          status: 'NOT_READY',
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Prometheus metrics endpoint
    app.get(getEnv('PROMETHEUS_METRICS_PATH', '/metrics'), async (req, res) => {
      res.set('Content-Type', metrics.register.contentType);
      res.end(await metrics.register.metrics());
    });

    // -------------------- Mock Venue Data --------------------
    // Bay Area venue mock data
    const mockVenues = [
      {
        id: '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p',
        googlePlaceId: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
        name: 'Blue Bottle Coffee',
        address: '1 Ferry Building, San Francisco, CA 94111',
        latitude: 37.7955,
        longitude: -122.3937,
        phone: '+14159866770',
        website: 'https://bluebottlecoffee.com',
        rating: 4.5,
        userRatingsCount: 1256,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/blue_bottle_1.jpg'],
        openingHours: {
          monday: '6:00 AM - 7:00 PM',
          tuesday: '6:00 AM - 7:00 PM',
          wednesday: '6:00 AM - 7:00 PM',
          thursday: '6:00 AM - 7:00 PM',
          friday: '6:00 AM - 7:00 PM',
          saturday: '7:00 AM - 7:00 PM',
          sunday: '7:00 AM - 7:00 PM',
        },
      },
      {
        id: '2b3c4d5e-6f7g-8h9i-0j1k-2l3m4n5o6p7q',
        googlePlaceId: 'ChIJXydSKnOAhYARhT2XB-3JOfg',
        name: 'Sightglass Coffee',
        address: '270 7th St, San Francisco, CA 94103',
        latitude: 37.7768,
        longitude: -122.4087,
        phone: '+14157787372',
        website: 'https://sightglasscoffee.com',
        rating: 4.4,
        userRatingsCount: 1123,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/sightglass_1.jpg'],
        openingHours: {
          monday: '7:00 AM - 6:00 PM',
          tuesday: '7:00 AM - 6:00 PM',
          wednesday: '7:00 AM - 6:00 PM',
          thursday: '7:00 AM - 6:00 PM',
          friday: '7:00 AM - 6:00 PM',
          saturday: '8:00 AM - 6:00 PM',
          sunday: '8:00 AM - 6:00 PM',
        },
      },
      {
        id: '3c4d5e6f-7g8h-9i0j-1k2l-3m4n5o6p7q8r',
        googlePlaceId: 'ChIJFUBxSY6AhYAR36YnCeSoDa0',
        name: 'Philz Coffee',
        address: '201 Berry St, San Francisco, CA 94158',
        latitude: 37.7766,
        longitude: -122.3922,
        phone: '+14157548889',
        website: 'https://www.philzcoffee.com',
        rating: 4.6,
        userRatingsCount: 1587,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/philz_1.jpg'],
        openingHours: {
          monday: '6:30 AM - 8:00 PM',
          tuesday: '6:30 AM - 8:00 PM',
          wednesday: '6:30 AM - 8:00 PM',
          thursday: '6:30 AM - 8:00 PM',
          friday: '6:30 AM - 8:00 PM',
          saturday: '7:00 AM - 8:00 PM',
          sunday: '7:00 AM - 8:00 PM',
        },
      },
      {
        id: '4d5e6f7g-8h9i-0j1k-2l3m-4n5o6p7q8r9s',
        googlePlaceId: 'ChIJG-sfA3qAhYARTUEf1JdU4Gs',
        name: 'Equator Coffees',
        address: '986 Market St, San Francisco, CA 94102',
        latitude: 37.7829,
        longitude: -122.4094,
        phone: '+14158651370',
        website: 'https://www.equatorcoffees.com',
        rating: 4.3,
        userRatingsCount: 876,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/equator_1.jpg'],
        openingHours: {
          monday: '7:00 AM - 5:00 PM',
          tuesday: '7:00 AM - 5:00 PM',
          wednesday: '7:00 AM - 5:00 PM',
          thursday: '7:00 AM - 5:00 PM',
          friday: '7:00 AM - 5:00 PM',
          saturday: '8:00 AM - 5:00 PM',
          sunday: '8:00 AM - 5:00 PM',
        },
      },
      {
        id: '5e6f7g8h-9i0j-1k2l-3m4n-5o6p7q8r9s0t',
        googlePlaceId: 'ChIJB9703oSAhYARCrZ1MagYzpI',
        name: 'Tartine Bakery',
        address: '600 Guerrero St, San Francisco, CA 94110',
        latitude: 37.7614,
        longitude: -122.4241,
        phone: '+14154872600',
        website: 'https://tartinebakery.com',
        rating: 4.5,
        userRatingsCount: 2345,
        priceLevel: '2',
        types: ['bakery', 'cafe'],
        photos: ['https://example.com/photos/tartine_1.jpg'],
        openingHours: {
          monday: '7:30 AM - 5:00 PM',
          tuesday: '7:30 AM - 5:00 PM',
          wednesday: '7:30 AM - 5:00 PM',
          thursday: '7:30 AM - 5:00 PM',
          friday: '7:30 AM - 5:00 PM',
          saturday: '8:00 AM - 6:00 PM',
          sunday: '8:00 AM - 6:00 PM',
        },
      },
      {
        id: '6f7g8h9i-0j1k-2l3m-4n5o-6p7q8r9s0t1u',
        googlePlaceId: 'ChIJJ2MgCYSAhYARcLY7UnDWiJw',
        name: 'Flour + Water',
        address: '2401 Harrison St, San Francisco, CA 94110',
        latitude: 37.7590,
        longitude: -122.4123,
        phone: '+14158267000',
        website: 'https://flourandwater.com',
        rating: 4.4,
        userRatingsCount: 1876,
        priceLevel: '3',
        types: ['restaurant', 'italian_restaurant'],
        photos: ['https://example.com/photos/flour_water_1.jpg'],
        openingHours: {
          monday: '5:30 PM - 10:00 PM',
          tuesday: '5:30 PM - 10:00 PM',
          wednesday: '5:30 PM - 10:00 PM',
          thursday: '5:30 PM - 10:00 PM',
          friday: '5:30 PM - 11:00 PM',
          saturday: '5:30 PM - 11:00 PM',
          sunday: '5:30 PM - 10:00 PM',
        },
      },
      {
        id: '7g8h9i0j-1k2l-3m4n-5o6p-7q8r9s0t1u2v',
        googlePlaceId: 'ChIJFUBxSY6AhYAR36YnCeSoDa0',
        name: 'Samovar Tea Lounge',
        address: '730 Howard St, San Francisco, CA 94103',
        latitude: 37.7851,
        longitude: -122.4018,
        phone: '+14157279850',
        website: 'https://samovartea.com',
        rating: 4.2,
        userRatingsCount: 756,
        priceLevel: '2',
        types: ['cafe', 'tea_room'],
        photos: ['https://example.com/photos/samovar_1.jpg'],
        openingHours: {
          monday: '9:00 AM - 6:00 PM',
          tuesday: '9:00 AM - 6:00 PM',
          wednesday: '9:00 AM - 6:00 PM',
          thursday: '9:00 AM - 6:00 PM',
          friday: '9:00 AM - 6:00 PM',
          saturday: '10:00 AM - 7:00 PM',
          sunday: '10:00 AM - 7:00 PM',
        },
      },
      {
        id: '8h9i0j1k-2l3m-4n5o-6p7q-8r9s0t1u2v3w',
        googlePlaceId: 'ChIJQYJJQoWAhYARqR1SQVlX2Zg',
        name: 'Tonga Room & Hurricane Bar',
        address: '950 Mason St, San Francisco, CA 94108',
        latitude: 37.7924,
        longitude: -122.4102,
        phone: '+14157725278',
        website: 'https://www.fairmont.com/san-francisco/dining/tonga-room-hurricane-bar',
        rating: 4.3,
        userRatingsCount: 1432,
        priceLevel: '3',
        types: ['bar', 'restaurant'],
        photos: ['https://example.com/photos/tonga_room_1.jpg'],
        openingHours: {
          monday: 'Closed',
          tuesday: 'Closed',
          wednesday: '5:00 PM - 11:00 PM',
          thursday: '5:00 PM - 11:00 PM',
          friday: '5:00 PM - 11:30 PM',
          saturday: '5:00 PM - 11:30 PM',
          sunday: '5:00 PM - 10:00 PM',
        },
      },
      {
        id: '9i0j1k2l-3m4n-5o6p-7q8r-9s0t1u2v3w4x',
        googlePlaceId: 'ChIJlU6Ld4qAhYARCLC0CtM6aqw',
        name: 'Zeitgeist',
        address: '199 Valencia St, San Francisco, CA 94103',
        latitude: 37.7697,
        longitude: -122.4221,
        phone: '+14156219772',
        website: 'https://www.zeitgeistsf.com',
        rating: 4.4,
        userRatingsCount: 2134,
        priceLevel: '1',
        types: ['bar', 'pub'],
        photos: ['https://example.com/photos/zeitgeist_1.jpg'],
        openingHours: {
          monday: '12:00 PM - 2:00 AM',
          tuesday: '12:00 PM - 2:00 AM',
          wednesday: '12:00 PM - 2:00 AM',
          thursday: '12:00 PM - 2:00 AM',
          friday: '12:00 PM - 2:00 AM',
          saturday: '9:00 AM - 2:00 AM',
          sunday: '9:00 AM - 2:00 AM',
        },
      },
      {
        id: '0j1k2l3m-4n5o-6p7q-8r9s-0t1u2v3w4x5y',
        googlePlaceId: 'ChIJG-sfA3qAhYARTUEf1JdU4Gs',
        name: 'Sushi Umi',
        address: '549 Castro St, San Francisco, CA 94114',
        latitude: 37.7598,
        longitude: -122.4351,
        phone: '+14154316081',
        website: 'https://sushiumisf.com',
        rating: 4.2,
        userRatingsCount: 876,
        priceLevel: '3',
        types: ['restaurant', 'japanese_restaurant', 'sushi'],
        photos: ['https://example.com/photos/sushi_umi_1.jpg'],
        openingHours: {
          monday: '11:30 AM - 9:30 PM',
          tuesday: '11:30 AM - 9:30 PM',
          wednesday: '11:30 AM - 9:30 PM',
          thursday: '11:30 AM - 9:30 PM',
          friday: '11:30 AM - 10:00 PM',
          saturday: '11:30 AM - 10:00 PM',
          sunday: '11:30 AM - 9:30 PM',
        },
      },
      {
        id: '1k2l3m4n-5o6p-7q8r-9s0t-1u2v3w4x5y6z',
        googlePlaceId: 'ChIJFUBxSY6AhYAR36YnCeSoDa0',
        name: 'Dolores Park Cafe',
        address: '501 Dolores St, San Francisco, CA 94110',
        latitude: 37.7597,
        longitude: -122.4262,
        phone: '+14156214576',
        website: 'https://www.doloresparkca.com',
        rating: 4.1,
        userRatingsCount: 987,
        priceLevel: '2',
        types: ['cafe', 'restaurant'],
        photos: ['https://example.com/photos/dolores_park_cafe_1.jpg'],
        openingHours: {
          monday: '7:00 AM - 7:00 PM',
          tuesday: '7:00 AM - 7:00 PM',
          wednesday: '7:00 AM - 7:00 PM',
          thursday: '7:00 AM - 7:00 PM',
          friday: '7:00 AM - 7:00 PM',
          saturday: '7:00 AM - 7:00 PM',
          sunday: '7:00 AM - 7:00 PM',
        },
      },
      {
        id: '2l3m4n5o-6p7q-8r9s-0t1u-2v3w4x5y6z7a',
        googlePlaceId: 'ChIJlU6Ld4qAhYARCLC0CtM6aqw',
        name: 'Bi-Rite Creamery',
        address: '3692 18th St, San Francisco, CA 94110',
        latitude: 37.7614,
        longitude: -122.4266,
        phone: '+14156265600',
        website: 'https://biritemarket.com/creamery',
        rating: 4.7,
        userRatingsCount: 2543,
        priceLevel: '2',
        types: ['ice_cream_shop', 'dessert'],
        photos: ['https://example.com/photos/birite_1.jpg'],
        openingHours: {
          monday: '1:00 PM - 9:00 PM',
          tuesday: '1:00 PM - 9:00 PM',
          wednesday: '1:00 PM - 9:00 PM',
          thursday: '1:00 PM - 9:00 PM',
          friday: '1:00 PM - 10:00 PM',
          saturday: '12:00 PM - 10:00 PM',
          sunday: '12:00 PM - 9:00 PM',
        },
      },
      {
        id: '3m4n5o6p-7q8r-9s0t-1u2v-3w4x5y6z7a8b',
        googlePlaceId: 'ChIJQYJJQoWAhYARqR1SQVlX2Zg',
        name: 'Peet\'s Coffee',
        address: '549 Castro St, San Francisco, CA 94114',
        latitude: 37.7598,
        longitude: -122.4351,
        phone: '+14156214576',
        website: 'https://www.peets.com',
        rating: 4.2,
        userRatingsCount: 765,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/peets_1.jpg'],
        openingHours: {
          monday: '5:30 AM - 8:00 PM',
          tuesday: '5:30 AM - 8:00 PM',
          wednesday: '5:30 AM - 8:00 PM',
          thursday: '5:30 AM - 8:00 PM',
          friday: '5:30 AM - 8:00 PM',
          saturday: '6:00 AM - 8:00 PM',
          sunday: '6:00 AM - 8:00 PM',
        },
      },
      {
        id: '4n5o6p7q-8r9s-0t1u-2v3w-4x5y6z7a8b9c',
        googlePlaceId: 'ChIJG-sfA3qAhYARTUEf1JdU4Gs',
        name: 'The Interval at Long Now',
        address: 'Landmark Building A, 2 Marina Blvd, San Francisco, CA 94123',
        latitude: 37.8066,
        longitude: -122.4301,
        phone: '+14157762969',
        website: 'https://theinterval.org',
        rating: 4.6,
        userRatingsCount: 543,
        priceLevel: '2',
        types: ['bar', 'cafe'],
        photos: ['https://example.com/photos/interval_1.jpg'],
        openingHours: {
          monday: 'Closed',
          tuesday: '10:00 AM - 10:00 PM',
          wednesday: '10:00 AM - 10:00 PM',
          thursday: '10:00 AM - 10:00 PM',
          friday: '10:00 AM - 12:00 AM',
          saturday: '10:00 AM - 12:00 AM',
          sunday: '10:00 AM - 10:00 PM',
        },
      },
      {
        id: '5o6p7q8r-9s0t-1u2v-3w4x-5y6z7a8b9c0d',
        googlePlaceId: 'ChIJFUBxSY6AhYAR36YnCeSoDa0',
        name: 'Four Barrel Coffee',
        address: '375 Valencia St, San Francisco, CA 94103',
        latitude: 37.7670,
        longitude: -122.4219,
        phone: '+14155252097',
        website: 'https://www.fourbarrelcoffee.com',
        rating: 4.3,
        userRatingsCount: 1432,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/four_barrel_1.jpg'],
        openingHours: {
          monday: '7:00 AM - 7:00 PM',
          tuesday: '7:00 AM - 7:00 PM',
          wednesday: '7:00 AM - 7:00 PM',
          thursday: '7:00 AM - 7:00 PM',
          friday: '7:00 AM - 7:00 PM',
          saturday: '8:00 AM - 7:00 PM',
          sunday: '8:00 AM - 7:00 PM',
        },
      },
      {
        id: '6p7q8r9s-0t1u-2v3w-4x5y-6z7a8b9c0d1e',
        googlePlaceId: 'ChIJlU6Ld4qAhYARCLC0CtM6aqw',
        name: 'Ritual Coffee Roasters',
        address: '1026 Valencia St, San Francisco, CA 94110',
        latitude: 37.7563,
        longitude: -122.4214,
        phone: '+14156411011',
        website: 'https://www.ritualroasters.com',
        rating: 4.4,
        userRatingsCount: 1098,
        priceLevel: '2',
        types: ['cafe', 'coffee_shop'],
        photos: ['https://example.com/photos/ritual_1.jpg'],
        openingHours: {
          monday: '6:30 AM - 7:00 PM',
          tuesday: '6:30 AM - 7:00 PM',
          wednesday: '6:30 AM - 7:00 PM',
          thursday: '6:30 AM - 7:00 PM',
          friday: '6:30 AM - 7:00 PM',
          saturday: '7:00 AM - 7:00 PM',
          sunday: '7:00 AM - 7:00 PM',
        },
      },
      {
        id: '7q8r9s0t-1u2v-3w4x-5y6z-7a8b9c0d1e2f',
        googlePlaceId: 'ChIJQYJJQoWAhYARqR1SQVlX2Zg',
        name: 'Gott\'s Roadside',
        address: 'Ferry Building, San Francisco, CA 94111',
        latitude: 37.7955,
        longitude: -122.3937,
        phone: '+14153183423',
        website: 'https://www.gotts.com',
        rating: 4.2,
        userRatingsCount: 2345,
        priceLevel: '2',
        types: ['restaurant', 'american_restaurant'],
        photos: ['https://example.com/photos/gotts_1.jpg'],
        openingHours: {
          monday: '10:00 AM - 9:00 PM',
          tuesday: '10:00 AM - 9:00 PM',
          wednesday: '10:00 AM - 9:00 PM',
          thursday: '10:00 AM - 9:00 PM',
          friday: '10:00 AM - 10:00 PM',
          saturday: '10:00 AM - 10:00 PM',
          sunday: '10:00 AM - 9:00 PM',
        },
      },
      {
        id: '8r9s0t1u-2v3w-4x5y-6z7a-8b9c0d1e2f3g',
        googlePlaceId: 'ChIJG-sfA3qAhYARTUEf1JdU4Gs',
        name: 'Dumpling Time',
        address: '11 Division St, San Francisco, CA 94103',
        latitude: 37.7694,
        longitude: -122.4024,
        phone: '+14154209588',
        website: 'https://www.dumplingtime.com',
        rating: 4.4,
        userRatingsCount: 1876,
        priceLevel: '2',
        types: ['restaurant', 'asian_restaurant'],
        photos: ['https://example.com/photos/dumpling_time_1.jpg'],
        openingHours: {
          monday: '11:00 AM - 9:00 PM',
          tuesday: '11:00 AM - 9:00 PM',
          wednesday: '11:00 AM - 9:00 PM',
          thursday: '11:00 AM - 9:00 PM',
          friday: '11:00 AM - 10:00 PM',
          saturday: '11:00 AM - 10:00 PM',
          sunday: '11:00 AM - 9:00 PM',
        },
      },
      {
        id: '9s0t1u2v-3w4x-5y6z-7a8b-9c0d1e2f3g4h',
        googlePlaceId: 'ChIJFUBxSY6AhYAR36YnCeSoDa0',
        name: 'Boba Guys',
        address: '429 Stockton St, San Francisco, CA 94108',
        latitude: 37.7891,
        longitude: -122.4075,
        phone: '+14159672622',
        website: 'https://www.bobaguys.com',
        rating: 4.5,
        userRatingsCount: 1432,
        priceLevel: '1',
        types: ['cafe', 'bubble_tea'],
        photos: ['https://example.com/photos/boba_guys_1.jpg'],
        openingHours: {
          monday: '11:00 AM - 8:00 PM',
          tuesday: '11:00 AM - 8:00 PM',
          wednesday: '11:00 AM - 8:00 PM',
          thursday: '11:00 AM - 8:00 PM',
          friday: '11:00 AM - 9:00 PM',
          saturday: '11:00 AM - 9:00 PM',
          sunday: '11:00 AM - 8:00 PM',
        },
      },
      {
        id: '0t1u2v3w-4x5y-6z7a-8b9c-0d1e2f3g4h5i',
        googlePlaceId: 'ChIJlU6Ld4qAhYARCLC0CtM6aqw',
        name: 'Smitten Ice Cream',
        address: '432 Octavia St #1a, San Francisco, CA 94102',
        latitude: 37.7764,
        longitude: -122.4242,
        phone: '+14158592469',
        website: 'https://www.smittenicecream.com',
        rating: 4.6,
        userRatingsCount: 987,
        priceLevel: '2',
        types: ['ice_cream_shop', 'dessert'],
        photos: ['https://example.com/photos/smitten_1.jpg'],
        openingHours: {
          monday: '12:00 PM - 10:00 PM',
          tuesday: '12:00 PM - 10:00 PM',
          wednesday: '12:00 PM - 10:00 PM',
          thursday: '12:00 PM - 10:00 PM',
          friday: '12:00 PM - 11:00 PM',
          saturday: '12:00 PM - 11:00 PM',
          sunday: '12:00 PM - 10:00 PM',
        },
      },
    ];

    // -------------------- Helper Functions --------------------

    // Convert miles to meters for geolib
    const milesToMeters = (miles: number): number => {
      return miles * 1609.34;
    };

    // Get venue by ID
    const getVenueById = async (venueId: string): Promise<any | null> => {
      // Try to get from Redis cache first
      const cacheKey = `venue:${venueId}`;
      const cachedVenue = await redisClient.get(cacheKey);
      
      if (cachedVenue) {
        logger.info({ venueId }, 'Venue retrieved from cache');
        return JSON.parse(cachedVenue);
      }

      // Check if venue exists in database
      const dbResult = await pool.query(
        'SELECT * FROM yeyzer.venues WHERE id = $1',
        [venueId]
      );

      if (dbResult.rows.length > 0) {
        const venue = dbResult.rows[0];
        
        // Cache the result
        await redisClient.set(cacheKey, JSON.stringify(venue), 'EX', 3600); // Cache for 1 hour
        
        logger.info({ venueId }, 'Venue retrieved from database and cached');
        return venue;
      }

      // If not in database, check mock data
      const mockVenue = mockVenues.find(v => v.id === venueId);
      if (mockVenue) {
        // Cache the result
        await redisClient.set(cacheKey, JSON.stringify(mockVenue), 'EX', 3600); // Cache for 1 hour
        
        logger.info({ venueId }, 'Venue retrieved from mock data and cached');
        return mockVenue;
      }

      return null;
    };

    // Search venues by location, radius, types, price, and keyword
    const searchVenues = (params: {
      latitude: number;
      longitude: number;
      radius?: number;
      types?: string[];
      priceMin?: number;
      priceMax?: number;
      keyword?: string;
    }): any[] => {
      const {
        latitude,
        longitude,
        radius = getEnvNumber('VENUE_DEFAULT_RADIUS', 5), // Default 5 miles
        types = getEnv('VENUE_TYPES', 'cafe,restaurant,bar').split(','),
        priceMin = getEnvNumber('VENUE_PRICE_MIN', 1),
        priceMax = getEnvNumber('VENUE_PRICE_MAX', 3),
        keyword,
      } = params;

      // Convert radius from miles to meters
      const radiusInMeters = milesToMeters(radius);

      // Filter venues by distance, type, and price
      return mockVenues.filter(venue => {
        // Check distance
        const distance = geolib.getDistance(
          { latitude, longitude },
          { latitude: venue.latitude, longitude: venue.longitude }
        );
        
        if (distance > radiusInMeters) {
          return false;
        }

        // Check venue type
        if (types.length > 0 && !venue.types.some(type => types.includes(type))) {
          return false;
        }

        // Check price level
        const venuePrice = parseInt(venue.priceLevel);
        if (venuePrice < priceMin || venuePrice > priceMax) {
          return false;
        }

        // Check keyword if provided
        if (keyword) {
          const lowerKeyword = keyword.toLowerCase();
          const nameMatch = venue.name.toLowerCase().includes(lowerKeyword);
          const addressMatch = venue.address.toLowerCase().includes(lowerKeyword);
          if (!nameMatch && !addressMatch) {
            return false;
          }
        }

        return true;
      }).map(venue => ({
        ...venue,
        distance: geolib.getDistance(
          { latitude, longitude },
          { latitude: venue.latitude, longitude: venue.longitude }
        ) / 1609.34, // Convert meters to miles
      })).sort((a, b) => a.distance - b.distance);
    };

    // -------------------- API Routes --------------------

    // Get venue recommendations for a match
    app.post('/api/venues/recommend/:matchId', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;
      const { scheduledDate } = req.body;

      // Get match details to find both users
      const matchResult = await pool.query(
        `SELECT m.user_id, m.matched_user_id,
                u1.first_name AS user1_first_name, u1.last_name AS user1_last_name,
                u2.first_name AS user2_first_name, u2.last_name AS user2_last_name,
                up1.latitude AS user1_latitude, up1.longitude AS user1_longitude,
                up2.latitude AS user2_latitude, up2.longitude AS user2_longitude
         FROM yeyzer.matches m
         JOIN yeyzer.users u1 ON m.user_id = u1.id
         JOIN yeyzer.users u2 ON m.matched_user_id = u2.id
         LEFT JOIN yeyzer.user_profiles up1 ON m.user_id = up1.user_id
         LEFT JOIN yeyzer.user_profiles up2 ON m.matched_user_id = up2.user_id
         WHERE m.id = $1`,
        [matchId]
      );

      if (matchResult.rows.length === 0) {
        throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
      }

      const match = matchResult.rows[0];
      
      // Check if both users have location data
      if (!match.user1_latitude || !match.user1_longitude || !match.user2_latitude || !match.user2_longitude) {
        throw new AppError('Both users must have location data', StatusCodes.BAD_REQUEST, 'MISSING_LOCATION_DATA');
      }

      // Calculate midpoint between the two users
      const midpoint = geolib.getCenter([
        { latitude: match.user1_latitude, longitude: match.user1_longitude },
        { latitude: match.user2_latitude, longitude: match.user2_longitude },
      ]);

      if (!midpoint) {
        throw new AppError('Failed to calculate midpoint', StatusCodes.INTERNAL_SERVER_ERROR, 'MIDPOINT_CALCULATION_FAILED');
      }

      // Get venue recommendations based on midpoint
      const radius = getEnvNumber('VENUE_DEFAULT_RADIUS', 5); // Default 5 miles
      const venueTypes = getEnv('VENUE_TYPES', 'cafe,restaurant,bar').split(',');
      const priceMin = getEnvNumber('VENUE_PRICE_MIN', 1);
      const priceMax = getEnvNumber('VENUE_PRICE_MAX', 3);

      const recommendations = searchVenues({
        latitude: midpoint.latitude,
        longitude: midpoint.longitude,
        radius,
        types: venueTypes,
        priceMin,
        priceMax,
      });

      // Take top 3 recommendations
      const topRecommendations = recommendations.slice(0, 3);

      // Store recommendations in database
      for (const venue of topRecommendations) {
        // First, ensure venue exists in the database
        await pool.query(
          `INSERT INTO yeyzer.venues (
            id, google_place_id, name, address, latitude, longitude, 
            phone, website, rating, user_ratings_count, price_level, types, photos, opening_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            google_place_id = EXCLUDED.google_place_id,
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            phone = EXCLUDED.phone,
            website = EXCLUDED.website,
            rating = EXCLUDED.rating,
            user_ratings_count = EXCLUDED.user_ratings_count,
            price_level = EXCLUDED.price_level,
            types = EXCLUDED.types,
            photos = EXCLUDED.photos,
            opening_hours = EXCLUDED.opening_hours,
            updated_at = NOW()`,
          [
            venue.id,
            venue.googlePlaceId,
            venue.name,
            venue.address,
            venue.latitude,
            venue.longitude,
            venue.phone,
            venue.website,
            venue.rating,
            venue.userRatingsCount,
            venue.priceLevel,
            JSON.stringify(venue.types),
            JSON.stringify(venue.photos),
            JSON.stringify(venue.openingHours),
          ]
        );

        // Then, create venue recommendation
        await pool.query(
          `INSERT INTO yeyzer.venue_recommendations (
            id, match_id, venue_id, reason, distance_from_midpoint
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (match_id, venue_id) DO UPDATE SET
            reason = EXCLUDED.reason,
            distance_from_midpoint = EXCLUDED.distance_from_midpoint,
            updated_at = NOW()`,
          [
            uuidv4(),
            matchId,
            venue.id,
            `${venue.name} is a great place to meet, located ${venue.distance.toFixed(2)} miles from your midpoint.`,
            venue.distance,
          ]
        );
      }

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          {
            matchId,
            midpoint,
            recommendations: topRecommendations.map(venue => ({
              id: venue.id,
              name: venue.name,
              address: venue.address,
              latitude: venue.latitude,
              longitude: venue.longitude,
              rating: venue.rating,
              priceLevel: venue.priceLevel,
              types: venue.types,
              distance: venue.distance,
              reason: `${venue.name} is a great place to meet, located ${venue.distance.toFixed(2)} miles from your midpoint.`,
            })),
          },
          'Venue recommendations generated successfully'
        )
      );
    }));

    // Get venue details
    app.get('/api/venues/:venueId', asyncHandler(async (req: Request, res: Response) => {
      const { venueId } = req.params;

      const venue = await getVenueById(venueId);

      if (!venue) {
        throw new AppError('Venue not found', StatusCodes.NOT_FOUND, 'VENUE_NOT_FOUND');
      }

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { venue },
          'Venue details retrieved successfully'
        )
      );
    }));

    // Search venues
    app.get('/api/venues/search', asyncHandler(async (req: Request, res: Response) => {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        throw new AppError('Valid latitude and longitude are required', StatusCodes.BAD_REQUEST, 'INVALID_COORDINATES');
      }

      const radius = req.query.radius ? parseFloat(req.query.radius as string) : undefined;
      const types = req.query.types ? (req.query.types as string).split(',') : undefined;
      const priceMin = req.query.priceMin ? parseInt(req.query.priceMin as string) : undefined;
      const priceMax = req.query.priceMax ? parseInt(req.query.priceMax as string) : undefined;
      const keyword = req.query.keyword as string;

      const venues = searchVenues({
        latitude,
        longitude,
        radius,
        types,
        priceMin,
        priceMax,
        keyword,
      });

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { venues },
          `Found ${venues.length} venues matching your criteria`
        )
      );
    }));

    // Select a venue for a match
    app.post('/api/venues/:venueId/select/:matchId', asyncHandler(async (req: Request, res: Response) => {
      const { venueId, matchId } = req.params;
      const { scheduledTime } = req.body;

      if (!scheduledTime) {
        throw new AppError('Scheduled time is required', StatusCodes.BAD_REQUEST, 'MISSING_SCHEDULED_TIME');
      }

      // Check if venue exists
      const venue = await getVenueById(venueId);
      if (!venue) {
        throw new AppError('Venue not found', StatusCodes.NOT_FOUND, 'VENUE_NOT_FOUND');
      }

      // Check if match exists
      const matchResult = await pool.query(
        'SELECT * FROM yeyzer.matches WHERE id = $1',
        [matchId]
      );
      if (matchResult.rows.length === 0) {
        throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
      }

      // Update match with selected venue and scheduled time
      await pool.query(
        `UPDATE yeyzer.matches 
         SET status = $1, scheduled_venue_id = $2, scheduled_time = $3, updated_at = NOW()
         WHERE id = $4`,
        ['SCHEDULED', venueId, scheduledTime, matchId]
      );

      // Update venue recommendation to mark as selected
      await pool.query(
        `UPDATE yeyzer.venue_recommendations
         SET selected = TRUE, updated_at = NOW()
         WHERE match_id = $1 AND venue_id = $2`,
        [matchId, venueId]
      );

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          {
            matchId,
            venueId,
            scheduledTime,
            venue: {
              name: venue.name,
              address: venue.address,
            },
          },
          'Venue selected and scheduled successfully'
        )
      );
    }));

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error({ err, req }, 'Error occurred');
      
      if (err instanceof AppError) {
        res
          .status(err.statusCode)
          .json(createErrorResponse(err, String(req.id)));
        return;
      }
      
      const appError = new AppError(
        'Internal server error',
        StatusCodes.INTERNAL_SERVER_ERROR,
        'INTERNAL_SERVER_ERROR'
      );
    
      res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json(createErrorResponse(appError, String(req.id)));
    });
    
    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(StatusCodes.NOT_FOUND).json(
        createErrorResponse(
          new AppError('Not found', StatusCodes.NOT_FOUND, 'NOT_FOUND'),
          String(req.id)
        )
      );
    });
    
    // Start server
    server = httpServer.listen(PORT, HOST, () => {
      logger.info(`Venue service listening at http://${HOST}:${PORT}`);
    });
    
    logger.info('Venue service started successfully');
    
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
startServer().catch(err => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

export default app;
