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
import { WebSocketServer, WebSocket } from 'ws';
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
import { VoiceCommandTypeEnum } from '@yeyzer/types';
import http from 'http';

// Initialize logger
const logger = createPinoLogger('voice-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('voice_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4007); // Default to 4007
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server
const httpServer = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws/voice' });

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

        // Close WebSocket server
        wss.close(() => {
          logger.info('WebSocket server closed');
        });

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

    // -------------------- REST API Endpoints --------------------\n
    // POST /api/voice/sessions/start - Start a voice session
    app.post('/api/voice/sessions/start', asyncHandler(async (req: Request, res: Response) => {
      const { userId, deviceType, browser, os } = req.body;

      if (!userId) {
        throw new AppError('User ID is required', StatusCodes.BAD_REQUEST, 'MISSING_USER_ID');
      }

      const sessionId = uuidv4();
      await pool.query(
        `INSERT INTO yeyzer.voice_sessions (id, user_id, device_type, browser, os)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, userId, deviceType, browser, os]
      );

      logger.info({ sessionId, userId }, 'Voice session started');
      res.status(StatusCodes.CREATED).json(
        createSuccessResponse({ sessionId }, 'Voice session started successfully')
      );
    }));

    // POST /api/voice/sessions/:sessionId/end - End a voice session
    app.post('/api/voice/sessions/:sessionId/end', asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const result = await pool.query(
        `UPDATE yeyzer.voice_sessions SET active = FALSE, ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Voice session not found', StatusCodes.NOT_FOUND, 'SESSION_NOT_FOUND');
      }

      logger.info({ sessionId }, 'Voice session ended');
      res.status(StatusCodes.OK).json(
        createSuccessResponse({ sessionId }, 'Voice session ended successfully')
      );
    }));

    // GET /api/voice/sessions/:sessionId - Get session details
    app.get('/api/voice/sessions/:sessionId', asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const result = await pool.query(
        'SELECT * FROM yeyzer.voice_sessions WHERE id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Voice session not found', StatusCodes.NOT_FOUND, 'SESSION_NOT_FOUND');
      }

      const session = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse({ session }, 'Voice session details retrieved successfully')
      );
    }));

    // POST /api/voice/commands/process - Process a voice command (mock)
    app.post('/api/voice/commands/process', asyncHandler(async (req: Request, res: Response) => {
      const { sessionId, userId, transcription, audioUrl } = req.body;

      if (!sessionId || !userId || !transcription) {
        throw new AppError('Session ID, User ID, and Transcription are required', StatusCodes.BAD_REQUEST, 'MISSING_COMMAND_DATA');
      }

      // Mock command type detection
      let commandType: (typeof VoiceCommandTypeEnum.enum)[keyof typeof VoiceCommandTypeEnum.enum] =
        VoiceCommandTypeEnum.enum.UNKNOWN;
      const lowerTranscription = transcription.toLowerCase();

      if (lowerTranscription.includes('wake') || lowerTranscription.includes('yeyzer')) {
        commandType = VoiceCommandTypeEnum.enum.WAKE;
      } else if (lowerTranscription.includes('match') || lowerTranscription.includes('find me someone')) {
        commandType = VoiceCommandTypeEnum.enum.MATCH;
      } else if (lowerTranscription.includes('chat') || lowerTranscription.includes('message')) {
        commandType = VoiceCommandTypeEnum.enum.CHAT;
      } else if (lowerTranscription.includes('venue') || lowerTranscription.includes('meetup')) {
        commandType = VoiceCommandTypeEnum.enum.VENUE;
      } else if (lowerTranscription.includes('schedule')) {
        commandType = VoiceCommandTypeEnum.enum.SCHEDULE;
      } else if (lowerTranscription.includes('help')) {
        commandType = VoiceCommandTypeEnum.enum.HELP;
      } else if (lowerTranscription.includes('cancel')) {
        commandType = VoiceCommandTypeEnum.enum.CANCEL;
      }

      const commandId = uuidv4();
      await pool.query(
        `INSERT INTO yeyzer.voice_commands (id, session_id, user_id, audio_url, transcription, command_type, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [commandId, sessionId, userId, audioUrl, transcription, commandType, Math.random()]
      );

      logger.info({ commandId, userId, commandType, transcription }, 'Voice command processed');
      res.status(StatusCodes.CREATED).json(
        createSuccessResponse({ commandId, commandType, transcription }, 'Voice command processed successfully')
      );
    }));

    // -------------------- WebSocket Server --------------------\n
    // Handle WebSocket connections
    wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection for voice streaming');

      ws.on('message', async (message: Buffer) => {
        // Assuming message is raw audio data for simplicity
        // In a real scenario, this would involve a proper audio format and streaming protocol
        const transcription = `Mock transcription of audio data (${message.length} bytes)`;
        const audioResponse = `Mock audio response for: "${transcription}"`;

        // Simulate STT processing
        logger.debug({ audioLength: message.length }, 'Received audio stream for processing');

        // Simulate TTS response
        ws.send(JSON.stringify({
          type: 'tts_audio',
          audioData: Buffer.from(audioResponse).toString('base64'), // Base64 encode mock audio
          text: audioResponse,
        }));

        // Simulate command processing and storage
        const sessionId = 'mock-session-id'; // In a real app, session ID would be passed or derived
        const userId = 'mock-user-id'; // In a real app, user ID would be authenticated

        let commandType: (typeof VoiceCommandTypeEnum.enum)[keyof typeof VoiceCommandTypeEnum.enum] =
          VoiceCommandTypeEnum.enum.UNKNOWN;
        if (transcription.toLowerCase().includes('hello')) {
          commandType = VoiceCommandTypeEnum.enum.WAKE;
        } else if (transcription.toLowerCase().includes('match')) {
          commandType = VoiceCommandTypeEnum.enum.MATCH;
        }

        const commandId = uuidv4();
        try {
          await pool.query(
            `INSERT INTO yeyzer.voice_commands (id, session_id, user_id, transcription, command_type, confidence)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [commandId, sessionId, userId, transcription, commandType, Math.random()]
          );
          logger.info({ commandId, transcription, commandType }, 'Voice command saved via WebSocket');
        } catch (dbErr) {
          logger.error({ dbErr }, 'Failed to save voice command from WebSocket');
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed for voice streaming');
      });

      ws.on('error', (error) => {
        logger.error({ error }, 'WebSocket error in voice streaming');
      });

      ws.send(JSON.stringify({ type: 'info', message: 'Connected to Yeyzer Voice Service WebSocket' }));
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
      logger.info(`Voice service listening at http://${HOST}:${PORT}`);
      logger.info(`Voice WebSocket available at ws://${HOST}:${PORT}/ws/voice`);
    });

    logger.info('Voice service started successfully');

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
