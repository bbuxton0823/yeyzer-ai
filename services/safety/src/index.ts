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
import * as cron from 'node-cron';
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
import {
  SafetyReportReasonEnum,
  SafetyReportStatusEnum,
  CheckInStatusEnum,
  CheckInResponseEnum,
} from '@yeyzer/types';
import http from 'http';

// Initialize logger
const logger = createPinoLogger('safety-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('safety_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4008); // Default to 4008
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server
const httpServer = http.createServer(app);

// Database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  min: getEnvNumber('DATABASE_POOL_MIN', 2),
  max: getEnvNumber('DATABASE_POOL_MAX', 10),
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

        res.status(StatusCodes.OK).json({
          status: 'READY',
          checks: {
            database: 'UP',
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

    // -------------------- API Routes --------------------

    // POST /api/safety/report - Create a safety report
    app.post('/api/safety/report', asyncHandler(async (req: Request, res: Response) => {
      const { reporterId, reportedUserId, matchId, messageId, reason, details } = req.body;

      if (!reporterId || !reportedUserId || !reason) {
        throw new AppError('Reporter ID, Reported User ID, and Reason are required', StatusCodes.BAD_REQUEST, 'MISSING_REPORT_DATA');
      }
      if (!Object.values(SafetyReportReasonEnum).includes(reason)) {
        throw new AppError('Invalid report reason', StatusCodes.BAD_REQUEST, 'INVALID_REPORT_REASON');
      }

      const reportId = uuidv4();
      await pool.query(
        `INSERT INTO yeyzer.safety_reports (id, reporter_id, reported_user_id, match_id, message_id, reason, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reportId, reporterId, reportedUserId, matchId, messageId, reason, details]
      );

      logger.info({ reportId, reporterId, reportedUserId, reason }, 'Safety report created');
      res.status(StatusCodes.CREATED).json(
        createSuccessResponse({ reportId }, 'Safety report created successfully')
      );
    }));

    // GET /api/safety/reports/:reportId - Get a specific report
    app.get('/api/safety/reports/:reportId', asyncHandler(async (req: Request, res: Response) => {
      const { reportId } = req.params;

      const result = await pool.query(
        'SELECT * FROM yeyzer.safety_reports WHERE id = $1',
        [reportId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Report not found', StatusCodes.NOT_FOUND, 'REPORT_NOT_FOUND');
      }

      const report = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse({ report }, 'Report retrieved successfully')
      );
    }));

    // GET /api/safety/reports - List reports (with filters)
    app.get('/api/safety/reports', asyncHandler(async (req: Request, res: Response) => {
      const { status, reporterId, reportedUserId } = req.query;
      let query = 'SELECT * FROM yeyzer.safety_reports WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (status) {
        if (!Object.values(SafetyReportStatusEnum).includes(status as any)) {
          throw new AppError('Invalid report status', StatusCodes.BAD_REQUEST, 'INVALID_REPORT_STATUS');
        }
        query += ` AND status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }
      if (reporterId) {
        query += ` AND reporter_id = $${paramIndex}`;
        queryParams.push(reporterId);
        paramIndex++;
      }
      if (reportedUserId) {
        query += ` AND reported_user_id = $${paramIndex}`;
        queryParams.push(reportedUserId);
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, queryParams);

      res.status(StatusCodes.OK).json(
        createSuccessResponse({ reports: result.rows }, `Retrieved ${result.rows.length} reports`)
      );
    }));

    // PATCH /api/safety/reports/:reportId/status - Update report status
    app.patch('/api/safety/reports/:reportId/status', asyncHandler(async (req: Request, res: Response) => {
      const { reportId } = req.params;
      const { status, adminNotes } = req.body;

      if (!status) {
        throw new AppError('Status is required', StatusCodes.BAD_REQUEST, 'MISSING_STATUS');
      }
      if (!Object.values(SafetyReportStatusEnum).includes(status)) {
        throw new AppError('Invalid status', StatusCodes.BAD_REQUEST, 'INVALID_STATUS');
      }

      const result = await pool.query(
        `UPDATE yeyzer.safety_reports SET status = $1, admin_notes = $2, updated_at = NOW(), resolved_at = CASE WHEN $1 = 'RESOLVED' THEN NOW() ELSE resolved_at END WHERE id = $3 RETURNING *`,
        [status, adminNotes, reportId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Report not found', StatusCodes.NOT_FOUND, 'REPORT_NOT_FOUND');
      }

      res.status(StatusCodes.OK).json(
        createSuccessResponse({ report: result.rows[0] }, 'Report status updated successfully')
      );
    }));

    // POST /api/safety/check-ins - Create a check-in
    app.post('/api/safety/check-ins', asyncHandler(async (req: Request, res: Response) => {
      const { userId, matchId, scheduledTime } = req.body;

      if (!userId || !matchId || !scheduledTime) {
        throw new AppError('User ID, Match ID, and Scheduled Time are required', StatusCodes.BAD_REQUEST, 'MISSING_CHECKIN_DATA');
      }

      const checkInId = uuidv4();
      await pool.query(
        `INSERT INTO yeyzer.check_ins (id, user_id, match_id, scheduled_time)
         VALUES ($1, $2, $3, $4)`,
        [checkInId, userId, matchId, scheduledTime]
      );

      logger.info({ checkInId, userId, matchId }, 'Check-in created');
      res.status(StatusCodes.CREATED).json(
        createSuccessResponse({ checkInId }, 'Check-in created successfully')
      );
    }));

    // GET /api/safety/check-ins/:checkInId - Get a check-in
    app.get('/api/safety/check-ins/:checkInId', asyncHandler(async (req: Request, res: Response) => {
      const { checkInId } = req.params;

      const result = await pool.query(
        'SELECT * FROM yeyzer.check_ins WHERE id = $1',
        [checkInId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Check-in not found', StatusCodes.NOT_FOUND, 'CHECKIN_NOT_FOUND');
      }

      const checkIn = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse({ checkIn }, 'Check-in retrieved successfully')
      );
    }));

    // POST /api/safety/check-ins/:checkInId/respond - Respond to check-in
    app.post('/api/safety/check-ins/:checkInId/respond', asyncHandler(async (req: Request, res: Response) => {
      const { checkInId } = req.params;
      const { response, notes } = req.body;

      if (!response) {
        throw new AppError('Response is required', StatusCodes.BAD_REQUEST, 'MISSING_RESPONSE');
      }
      if (!Object.values(CheckInResponseEnum).includes(response)) {
        throw new AppError('Invalid response', StatusCodes.BAD_REQUEST, 'INVALID_RESPONSE');
      }

      const result = await pool.query(
        `UPDATE yeyzer.check_ins SET response = $1, notes = $2, status = 'COMPLETED', check_in_time = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
        [response, notes, checkInId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Check-in not found', StatusCodes.NOT_FOUND, 'CHECKIN_NOT_FOUND');
      }

      res.status(StatusCodes.OK).json(
        createSuccessResponse({ checkIn: result.rows[0] }, 'Check-in response recorded successfully')
      );
    }));

    // GET /api/safety/check-ins/pending - Get pending check-ins
    app.get('/api/safety/check-ins/pending', asyncHandler(async (req: Request, res: Response) => {
      const result = await pool.query(
        `SELECT * FROM yeyzer.check_ins WHERE status = 'PENDING' AND scheduled_time <= NOW()`
      );

      res.status(StatusCodes.OK).json(
        createSuccessResponse({ checkIns: result.rows }, `Retrieved ${result.rows.length} pending check-ins`)
      );
    }));

    // -------------------- Cron Jobs --------------------

    // Cron job to create check-ins 2 hours after scheduled meetings
    // This cron job would typically run in a separate worker process or be triggered by an event system
    // For simplicity, it's included here but can be disabled/adjusted.
    const checkInCronSchedule = getEnv('CHECK_IN_CRON_SCHEDULE', '0 * * * *'); // Every hour
    cron.schedule(checkInCronSchedule, async () => {
      logger.info('Running scheduled check-in creation job');
      try {
        // Find matches that are scheduled and haven't had check-ins created yet
        const matchesResult = await pool.query(
          `SELECT id, user_id, matched_user_id, scheduled_time
           FROM yeyzer.matches
           WHERE status = 'SCHEDULED'
             AND scheduled_time IS NOT NULL
             AND scheduled_time + INTERVAL '2 hours' <= NOW()
             AND NOT EXISTS (
               SELECT 1 FROM yeyzer.check_ins 
               WHERE match_id = yeyzer.matches.id
             )`
        );

        logger.info({ matchCount: matchesResult.rows.length }, 'Found scheduled matches for check-ins');

        // Create check-ins for each match
        for (const match of matchesResult.rows) {
          // Create check-in for user1
          const checkIn1Id = uuidv4();
          await pool.query(
            `INSERT INTO yeyzer.check_ins (id, user_id, match_id, scheduled_time)
             VALUES ($1, $2, $3, $4)`,
            [checkIn1Id, match.user_id, match.id, new Date()]
          );

          // Create check-in for user2
          const checkIn2Id = uuidv4();
          await pool.query(
            `INSERT INTO yeyzer.check_ins (id, user_id, match_id, scheduled_time)
             VALUES ($1, $2, $3, $4)`,
            [checkIn2Id, match.matched_user_id, match.id, new Date()]
          );

          logger.info({ matchId: match.id, checkIn1Id, checkIn2Id }, 'Created check-ins for match');
        }

        logger.info({ createdCount: matchesResult.rows.length * 2 }, 'Check-in creation job completed');
      } catch (err) {
        logger.error({ err }, 'Error during scheduled check-in creation');
      }
    });

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
    
    // 404 handler - MUST be last middleware
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
      logger.info(`Safety service listening at http://${HOST}:${PORT}`);
    });
    
    logger.info('Safety service started successfully');
    
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
