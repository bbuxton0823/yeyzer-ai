import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import RedisStore from 'connect-redis';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import Redis from 'ioredis';
import { Pool } from 'pg';
import morgan from 'morgan';
import { StatusCodes } from 'http-status-codes';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
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
  createMetricsMiddleware,
  signJwt,
  verifyJwt
} from '@yeyzer/utils';
import { AuthPayloadSchema, LoginRequestSchema, UserSchema } from '@yeyzer/types';
import rateLimit from 'express-rate-limit';

// Initialize logger
const logger = createPinoLogger('auth-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('auth_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4001);
const HOST = getEnv('HOST', '0.0.0.0');

// Database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  min: getEnvNumber('DATABASE_POOL_MIN', 2),
  max: getEnvNumber('DATABASE_POOL_MAX', 10),
});

// Test database connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    logger.error({ err }, 'Failed to connect to database');
    process.exit(1);
  } else {
    logger.info('Connected to database');
  }
});

// Redis connection
const redisClient = new Redis(getEnv('REDIS_URL'));
redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});
redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

// Middleware
app.use(httpLogger);
app.use(helmet());
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

// Rate limiting
const limiter = rateLimit({
  windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60 * 1000),
  max: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});
app.use('/api/auth/login', limiter);
app.use('/api/auth/register', limiter);

// Session configuration
const sessionConfig = {
  store: new RedisStore({ client: redisClient }),
  secret: getEnv('SESSION_SECRET'),
  name: 'yeyzer.sid',
  resave: false,
  saveUninitialized: false,
  genid: () => uuidv4(),
  cookie: {
    secure: getEnvBoolean('COOKIE_SECURE', false),
    httpOnly: true,
    maxAge: getEnvNumber('SESSION_MAX_AGE', 24 * 60 * 60 * 1000), // 24 hours
    sameSite: getEnv('COOKIE_SAME_SITE', 'lax') as 'lax' | 'strict' | 'none',
  },
};
app.use(session(sessionConfig));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const result = await pool.query('SELECT * FROM yeyzer.users WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user) {
      return done(null, false);
    }
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
});

// Local strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        const result = await pool.query('SELECT * FROM yeyzer.users WHERE email = $1', [email]);
        const user = result.rows[0];
        
        if (!user) {
          return done(null, false, { message: 'Incorrect email or password' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect email or password' });
        }
        
        // Update last login time
        await pool.query('UPDATE yeyzer.users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// JWT strategy
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: getEnv('JWT_SECRET'),
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const result = await pool.query('SELECT * FROM yeyzer.users WHERE id = $1', [payload.userId]);
      const user = result.rows[0];
      
      if (!user) {
        return done(null, false);
      }
      
      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  })
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
    // Check database connection
    await pool.query('SELECT 1');
    
    // Check Redis connection
    await redisClient.ping();
    
    res.status(StatusCodes.OK).json({
      status: 'READY',
      checks: {
        database: 'UP',
        redis: 'UP',
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

// Auth routes
const authRouter = express.Router();

// Register endpoint
authRouter.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, firstName, lastName } = req.body;
    
    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM yeyzer.users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      throw new AppError('Email already in use', StatusCodes.CONFLICT, 'EMAIL_IN_USE');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const result = await pool.query(
      `INSERT INTO yeyzer.users (
        email, password, first_name, last_name, is_active
      ) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, created_at`,
      [email, hashedPassword, firstName, lastName, true]
    );
    
    const user = result.rows[0];
    
    logger.info({ userId: user.id }, 'New user registered');
    
    // Generate JWT token
    const payload = {
      userId: user.id,
      email: user.email,
      role: 'USER',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + getEnvNumber('JWT_EXPIRY_SECONDS', 86400), // 24 hours
    };
    
    const token = await signJwt(payload, getEnv('JWT_SECRET'));
    
    res.status(StatusCodes.CREATED).json(
      createSuccessResponse(
        {
          token,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            createdAt: user.created_at,
          },
        },
        'User registered successfully'
      )
    );
  })
);

// Login endpoint
authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const loginData = LoginRequestSchema.parse(req.body);
      
      // Authenticate with passport
      passport.authenticate('local', { session: false }, async (err: any, user: any, info: any) => {
        if (err) {
          return next(err);
        }
        
        if (!user) {
          throw new AppError(info?.message || 'Invalid credentials', StatusCodes.UNAUTHORIZED, 'INVALID_CREDENTIALS');
        }
        
        // Generate JWT token
        const payload = {
          userId: user.id,
          email: user.email,
          role: user.role || 'USER',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + getEnvNumber('JWT_EXPIRY_SECONDS', 86400), // 24 hours
        };
        
        const token = await signJwt(payload, getEnv('JWT_SECRET'));
        
        // Generate refresh token
        const refreshToken = await signJwt(
          {
            userId: user.id,
            tokenType: 'refresh',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + getEnvNumber('JWT_REFRESH_EXPIRY_SECONDS', 604800), // 7 days
          },
          getEnv('JWT_SECRET')
        );
        
        // Store session info
        await pool.query(
          `INSERT INTO yeyzer.sessions (
            id, user_id, ip_address, user_agent, expires_at, is_valid
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            uuidv4(),
            user.id,
            req.ip,
            req.headers['user-agent'],
            new Date(Date.now() + getEnvNumber('JWT_EXPIRY_SECONDS', 86400) * 1000),
            true,
          ]
        );
        
        logger.info({ userId: user.id }, 'User logged in');
        
        // Return user and token
        return res.json(
          createSuccessResponse(
            {
              token,
              refreshToken,
              user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                avatarUrl: user.avatar_url,
                role: user.role,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at,
              },
            },
            'Login successful'
          )
        );
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  })
);

// Refresh token endpoint
authRouter.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new AppError('Refresh token is required', StatusCodes.BAD_REQUEST, 'MISSING_REFRESH_TOKEN');
    }
    
    try {
      // Verify refresh token
      const decoded = await verifyJwt<{ userId: string; tokenType: string }>(refreshToken, getEnv('JWT_SECRET'));
      
      if (decoded.tokenType !== 'refresh') {
        throw new AppError('Invalid token type', StatusCodes.UNAUTHORIZED, 'INVALID_TOKEN_TYPE');
      }
      
      // Get user
      const result = await pool.query('SELECT * FROM yeyzer.users WHERE id = $1', [decoded.userId]);
      const user = result.rows[0];
      
      if (!user) {
        throw new AppError('User not found', StatusCodes.UNAUTHORIZED, 'USER_NOT_FOUND');
      }
      
      // Generate new JWT token
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role || 'USER',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + getEnvNumber('JWT_EXPIRY_SECONDS', 86400), // 24 hours
      };
      
      const newToken = await signJwt(payload, getEnv('JWT_SECRET'));
      
      // Generate new refresh token
      const newRefreshToken = await signJwt(
        {
          userId: user.id,
          tokenType: 'refresh',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + getEnvNumber('JWT_REFRESH_EXPIRY_SECONDS', 604800), // 7 days
        },
        getEnv('JWT_SECRET')
      );
      
      logger.info({ userId: user.id }, 'Token refreshed');
      
      res.json(
        createSuccessResponse(
          {
            token: newToken,
            refreshToken: newRefreshToken,
          },
          'Token refreshed successfully'
        )
      );
    } catch (err) {
      throw new AppError('Invalid or expired refresh token', StatusCodes.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
    }
  })
);

// Logout endpoint
authRouter.post(
  '/logout',
  passport.authenticate('jwt', { session: false }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user as any;
    
    // Invalidate all sessions for this user
    await pool.query('UPDATE yeyzer.sessions SET is_valid = false WHERE user_id = $1', [user.id]);
    
    logger.info({ userId: user.id }, 'User logged out');
    
    res.json(createSuccessResponse(null, 'Logout successful'));
  })
);

// OAuth endpoints (e.g., LinkedIn) removed in simplified MVP.
// Only email / password authentication is supported for now.

// Verify token endpoint
authRouter.get(
  '/verify',
  passport.authenticate('jwt', { session: false }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    
    res.json(
      createSuccessResponse(
        {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatarUrl: user.avatar_url,
            role: user.role,
          },
        },
        'Token is valid'
      )
    );
  }
);

// Mount auth routes
app.use('/api/auth', authRouter);

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
const server = app.listen(PORT, HOST, () => {
  logger.info(`Auth service listening at http://${HOST}:${PORT}`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  
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
