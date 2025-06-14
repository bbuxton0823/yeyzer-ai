import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginInlineTrace } from '@apollo/server/plugin/inlineTrace';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { constraintDirective, constraintDirectiveTypeDefs } from 'graphql-constraint-directive';
import { applyMiddleware } from 'graphql-middleware';
import depthLimit from 'graphql-depth-limit';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { expressjwt } from 'express-jwt';
import { verify as jwtVerify } from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import path from 'path';
import fs from 'fs';
import DataLoader from 'dataloader';
import Redis from 'ioredis';
import { PubSub } from 'graphql-subscriptions';
import { v4 as uuidv4 } from 'uuid';
import pinoHttp from 'pino-http';
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
  createMetricsMiddleware
} from '@yeyzer/utils';
import { resolvers } from './resolvers';
import { permissions } from './permissions';
import { createLoaders } from './dataloaders';
import { createServiceClients } from './services';
import { formatError } from './utils/formatError';
import { createContext, Context } from './context';

// Initialize logger
const logger = createPinoLogger('api-gateway');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('api_gateway');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 3000);
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize Redis for caching and PubSub
const redisClient = new Redis(getEnv('REDIS_URL'));
redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});
redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

// Initialize PubSub for GraphQL subscriptions
const pubsub = new PubSub();

// Load schema
const typeDefs = mergeTypeDefs([
  constraintDirectiveTypeDefs,
  fs.readFileSync(path.join(__dirname, 'schema.graphql'), 'utf-8')
]);

// Create executable schema
let schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

// Apply constraint directive
schema = constraintDirective()(schema);

// Apply permission middleware
schema = applyMiddleware(schema, permissions);

// Create WebSocket server for subscriptions
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Create service clients
const serviceClients = createServiceClients();

// WebSocket server cleanup
const serverCleanup = useServer({
  schema,
  context: async (ctx) => {
    // Extract token from connection params
    const token = ctx.connectionParams?.token as string;
    let user = null;
    
    if (token) {
      try {
        // Verify JWT token
        const decoded = jwtVerify(token, getEnv('JWT_SECRET')) as any;
        
        // Get user from auth service
        const authClient = serviceClients.auth;
        const userResponse = await authClient.get(`/api/auth/verify`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        user = userResponse.data?.data?.user || null;
      } catch (err) {
        logger.error({ err }, 'Error verifying subscription token');
      }
    }
    
    return {
      user,
      token,
      pubsub,
      loaders: createLoaders({ redisClient, serviceClients }),
      serviceClients,
      requestId: uuidv4()
    };
  },
}, wsServer);

// Create Apollo Server
const server = new ApolloServer({
  schema,
  formatError,
  introspection: !getEnvBoolean('DISABLE_INTROSPECTION', false),
  plugins: [
    // Proper shutdown for HTTP server
    ApolloServerPluginDrainHttpServer({ httpServer }),
    
    // Shutdown for WebSocket server
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
    
    // Add GraphQL IDE in development
    process.env.NODE_ENV !== 'production' 
      ? ApolloServerPluginLandingPageLocalDefault({ includeCookies: true }) 
      : undefined,
    
    // Add request tracing
    ApolloServerPluginInlineTrace(),
    
    // Custom plugin for logging and metrics
    {
      async requestDidStart(requestContext) {
        const { request, contextValue } = requestContext;
        const requestId = (contextValue as Context)?.requestId;
        
        logger.info({ 
          requestId, 
          operationName: request.operationName,
          query: request.query,
          variables: request.variables,
        }, 'GraphQL request started');
        
        const startTime = Date.now();
        
        return {
          async willSendResponse(responseContext) {
            const duration = Date.now() - startTime;
            
            // Record metrics
            metrics.httpRequestDurationMicroseconds
              .labels(
                'graphql', 
                request.operationName || 'anonymous', 
                responseContext.response.errors ? '500' : '200'
              )
              .observe(duration / 1000);
            
            logger.info({ 
              requestId, 
              operationName: request.operationName,
              duration,
              errors: responseContext.response.errors?.length || 0,
            }, 'GraphQL request completed');
          },
          async didEncounterErrors(errorsContext) {
            logger.error({ 
              requestId,
              operationName: request.operationName,
              errors: errorsContext.errors,
            }, 'GraphQL request encountered errors');
            
            // Increment error counter
            metrics.errorCounter.labels('graphql', 'error').inc();
          },
        };
      },
    },
  ].filter(Boolean),
});

// Start Apollo Server
await server.start();

// Middleware
app.use(httpLogger);
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// CORS configuration
const corsOptions = {
  origin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});
app.use('/graphql', limiter);

// JWT authentication middleware
app.use(
  expressjwt({
    secret: getEnv('JWT_SECRET'),
    algorithms: ['HS256'],
    credentialsRequired: false,
    requestProperty: 'auth',
  }).unless({ path: ['/health', '/readyz', getEnv('PROMETHEUS_METRICS_PATH', '/metrics')] })
);

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
    // Check Redis connection
    await redisClient.ping();
    
    // Check service availability
    const serviceStatus: Record<string, string> = {};
    
    // Check each service
    for (const [name, client] of Object.entries(serviceClients)) {
      try {
        await client.get('/health');
        serviceStatus[name] = 'UP';
      } catch (err) {
        serviceStatus[name] = 'DOWN';
        logger.error({ err, service: name }, 'Service health check failed');
      }
    }
    
    const allServicesUp = Object.values(serviceStatus).every(status => status === 'UP');
    
    if (allServicesUp) {
      res.status(StatusCodes.OK).json({
        status: 'READY',
        checks: {
          redis: 'UP',
          ...serviceStatus,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        status: 'NOT_READY',
        checks: {
          redis: 'UP',
          ...serviceStatus,
        },
        timestamp: new Date().toISOString(),
      });
    }
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

// Apply Apollo middleware
app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req, res }) => {
      // Create request ID
      const requestId = req.headers['x-request-id'] as string || uuidv4();
      
      // Get token from request
      const token = req.headers.authorization?.split(' ')[1] || '';
      
      // Get user from auth payload
      const user = req.auth || null;
      
      // Create DataLoaders
      const loaders = createLoaders({ redisClient, serviceClients });
      
      // Return context
      return createContext({
        req,
        res,
        user,
        token,
        pubsub,
        loaders,
        serviceClients,
        redisClient,
        requestId,
      });
    },
  })
);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json(
    createErrorResponse(
      new AppError('Not found', StatusCodes.NOT_FOUND, 'NOT_FOUND'),
      req.headers['x-request-id'] as string
    )
  );
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, req }, 'Error occurred');
  
  if (err.name === 'UnauthorizedError') {
    return res.status(StatusCodes.UNAUTHORIZED).json(
      createErrorResponse(
        new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED'),
        req.headers['x-request-id'] as string
      )
    );
  }
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(createErrorResponse(err, req.headers['x-request-id'] as string));
  }
  
  const appError = new AppError(
    'Internal server error',
    StatusCodes.INTERNAL_SERVER_ERROR,
    'INTERNAL_SERVER_ERROR'
  );
  
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
    createErrorResponse(appError, req.headers['x-request-id'] as string)
  );
});

// Start server
httpServer.listen(PORT, HOST, () => {
  logger.info(`API Gateway listening at http://${HOST}:${PORT}`);
  logger.info(`GraphQL endpoint available at http://${HOST}:${PORT}/graphql`);
  logger.info(`WebSocket endpoint available at ws://${HOST}:${PORT}/graphql`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  // Stop accepting new requests
  await server.stop();
  logger.info('Apollo Server stopped');
  
  // Close HTTP server
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close WebSocket server
      await serverCleanup.dispose();
      logger.info('WebSocket server closed');
      
      // Close Redis connection
      await redisClient.quit();
      logger.info('Redis connection closed');
      
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Listen for shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
