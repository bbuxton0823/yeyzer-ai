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
import OpenAI from 'openai';
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
import { MatchStatusEnum } from '@yeyzer/types';
import http from 'http';

// Initialize logger
const logger = createPinoLogger('conversation-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('conversation_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4005); // Default to 4005
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server
const httpServer = http.createServer(app);

// Database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  min: getEnvNumber('DATABASE_POOL_MIN', 2),
  max: getEnvNumber('DATABASE_POOL_MAX', 10),
});

// OpenAI client (optional, for LLM icebreaker generation)
let openai: OpenAI | undefined;
if (getEnv('OPENAI_API_KEY', '') !== '') {
  openai = new OpenAI({
    apiKey: getEnv('OPENAI_API_KEY'),
    organization: getEnv('OPENAI_ORG_ID', undefined),
  });
  logger.info('OpenAI client initialized for icebreaker generation');
} else {
  logger.warn('OPENAI_API_KEY not set. Using mock icebreaker generation.');
}

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

    // -------------------- Helper Functions --------------------

    const profanityList = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'damn', 'hell']; // Example list
    const profanityFilterLevel = getEnv('SAFETY_PROFANITY_FILTER_LEVEL', 'medium');

    const containsProfanity = (text: string): boolean => {
      if (profanityFilterLevel === 'none') return false;
      const lowerText = text.toLowerCase();
      return profanityList.some(word => lowerText.includes(word));
    };

    const generateIcebreaker = async (matchId: string): Promise<string> => {
      try {
        const matchResult = await pool.query(
          `SELECT m.user_id, m.matched_user_id,
                up1.headline AS user1_headline, up1.skills AS user1_skills, up1.interests AS user1_interests,
                up2.headline AS user2_headline, up2.skills AS user2_skills, up2.interests AS user2_interests
         FROM yeyzer.matches m
         LEFT JOIN yeyzer.user_profiles up1 ON m.user_id = up1.user_id
         LEFT JOIN yeyzer.user_profiles up2 ON m.matched_user_id = up2.user_id
         WHERE m.id = $1`,
          [matchId]
        );

        if (matchResult.rows.length === 0) {
          throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
        }

        const match = matchResult.rows[0];
        const user1 = {
          headline: match.user1_headline || 'a professional',
          skills: match.user1_skills ? match.user1_skills.join(', ') : 'various skills',
          interests: match.user1_interests ? match.user1_interests.join(', ') : 'various interests',
        };
        const user2 = {
          headline: match.user2_headline || 'a professional',
          skills: match.user2_skills ? match.user2_skills.join(', ') : 'various skills',
          interests: match.user2_interests ? match.user2_interests.join(', ') : 'various interests',
        };

        let icebreakerText: string;

        if (openai && getEnvBoolean('FEATURE_AUTO_ICEBREAKERS', true)) {
          try {
            const prompt = `Generate a professional networking icebreaker for two people.
            Person A: "${user1.headline}". Skills: ${user1.skills}. Interests: ${user1.interests}.
            Person B: "${user2.headline}". Skills: ${user2.skills}. Interests: ${user2.interests}.
            The icebreaker should be concise and encourage a real-world connection.`;

            const completion = await openai.chat.completions.create({
              model: getEnv('OPENAI_MODEL', 'gpt-4o'),
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 100,
            });
            icebreakerText = completion.choices[0].message?.content?.trim() || 'Hello! What brings you here today?';
            logger.info({ matchId, generatedBy: 'LLM' }, 'Icebreaker generated by LLM');
          } catch (llmError) {
            logger.error({ llmError, matchId }, 'Failed to generate icebreaker with LLM, falling back to mock.');
            icebreakerText = `Hi! I noticed your background in ${user2.skills.split(',')[0]}. I'd love to connect!`;
          }
        } else {
          const templates = [
            `Hi! I noticed your background in ${user2.skills.split(',')[0]}. I'd love to connect!`,
            `Hello! Your work as a ${user2.headline} sounds fascinating. What's your favorite part of your job?`,
            `It's great to meet you! I saw you have interests in ${user2.interests.split(',')[0]}. What sparked that interest?`,
            `I'm looking forward to connecting. Your profile mentions ${user2.headline}. How did you get into that field?`,
          ];
          icebreakerText = templates[Math.floor(Math.random() * templates.length)];
          logger.info({ matchId, generatedBy: 'Mock' }, 'Icebreaker generated by mock');
        }

        return icebreakerText;
      } catch (err) {
        logger.error({ err, matchId }, 'Error generating icebreaker');
        throw err;
      }
    };

    // -------------------- API Routes --------------------

    // Generate icebreaker for a match
    app.post('/api/icebreakers/generate/:matchId', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;

      const icebreakerText = await generateIcebreaker(matchId);

      const result = await pool.query(
        `INSERT INTO yeyzer.icebreakers (id, match_id, text, generated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (match_id) DO UPDATE SET
           text = EXCLUDED.text, generated_by = EXCLUDED.generated_by, accepted = FALSE, updated_at = NOW()
         RETURNING *`,
        [uuidv4(), matchId, icebreakerText, openai ? 'SYSTEM_LLM' : 'SYSTEM_MOCK']
      );

      const icebreaker = result.rows[0];
      res.status(StatusCodes.CREATED).json(
        createSuccessResponse(
          {
            id: icebreaker.id,
            matchId: icebreaker.match_id,
            text: icebreaker.text,
            generatedBy: icebreaker.generated_by,
            accepted: icebreaker.accepted,
          },
          'Icebreaker generated and saved successfully'
        )
      );
    }));

    // Get icebreaker for a match
    app.get('/api/icebreakers/:matchId', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;

      const result = await pool.query(
        'SELECT * FROM yeyzer.icebreakers WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1',
        [matchId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Icebreaker not found for this match', StatusCodes.NOT_FOUND, 'ICEBREAKER_NOT_FOUND');
      }

      const icebreaker = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse({
          id: icebreaker.id,
          matchId: icebreaker.match_id,
          text: icebreaker.text,
          generatedBy: icebreaker.generated_by,
          accepted: icebreaker.accepted,
        })
      );
    }));

    // Accept an icebreaker
    app.post('/api/icebreakers/:icebreakerId/accept', asyncHandler(async (req: Request, res: Response) => {
      const { icebreakerId } = req.params;

      const result = await pool.query(
        'UPDATE yeyzer.icebreakers SET accepted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
        [icebreakerId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Icebreaker not found', StatusCodes.NOT_FOUND, 'ICEBREAKER_NOT_FOUND');
      }

      const icebreaker = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          {
            id: icebreaker.id,
            matchId: icebreaker.match_id,
            text: icebreaker.text,
            generatedBy: icebreaker.generated_by,
            accepted: icebreaker.accepted,
          },
          'Icebreaker accepted successfully'
        )
      );
    }));

    // Send a message
    app.post('/api/chats/:matchId/messages', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;
      const { senderId, receiverId, content } = req.body; // Assuming senderId and receiverId are provided for now

      if (!senderId || !receiverId || !content) {
        throw new AppError('Sender ID, receiver ID, and content are required', StatusCodes.BAD_REQUEST, 'MISSING_MESSAGE_DATA');
      }

      if (containsProfanity(content)) {
        throw new AppError('Message contains profanity', StatusCodes.BAD_REQUEST, 'PROFANITY_DETECTED');
      }

      // Ensure chat exists or create it
      let chatResult = await pool.query(
        'SELECT id FROM yeyzer.chats WHERE match_id = $1',
        [matchId]
      );

      let chatId: string;
      if (chatResult.rows.length === 0) {
        // Create chat if it doesn't exist
        const newChatResult = await pool.query(
          `INSERT INTO yeyzer.chats (id, match_id, user1_id, user2_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [uuidv4(), matchId, senderId, receiverId] // Assuming senderId is user1 and receiverId is user2 for chat creation
        );
        chatId = newChatResult.rows[0].id;
      } else {
        chatId = chatResult.rows[0].id;
      }

      const messageId = uuidv4();
      await pool.query(
        `INSERT INTO yeyzer.messages (id, chat_id, sender_id, receiver_id, content, read)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, chatId, senderId, receiverId, content, false]
      );

      // Update chat's last_message_at
      await pool.query(
        'UPDATE yeyzer.chats SET last_message_at = NOW() WHERE id = $1',
        [chatId]
      );

      // Broadcast message to WebSocket clients
      broadcastMessage(chatId, {
        id: messageId,
        chatId,
        senderId,
        receiverId,
        content,
        read: false,
        createdAt: new Date().toISOString(),
      });

      res.status(StatusCodes.CREATED).json(
        createSuccessResponse(
          {
            id: messageId,
            chatId,
            senderId,
            receiverId,
            content,
            read: false,
          },
          'Message sent successfully'
        )
      );
    }));

    // Get messages for a chat
    app.get('/api/chats/:matchId/messages', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get chat ID from match ID
      const chatResult = await pool.query(
        'SELECT id FROM yeyzer.chats WHERE match_id = $1',
        [matchId]
      );

      if (chatResult.rows.length === 0) {
        return res.status(StatusCodes.OK).json(
          createSuccessResponse({ messages: [] }, 'No chat found for this match')
        );
      }

      const chatId = chatResult.rows[0].id;

      // Get messages
      const messagesResult = await pool.query(
        `SELECT * FROM yeyzer.messages 
         WHERE chat_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [chatId, limit, offset]
      );

      const messages = messagesResult.rows.map(msg => ({
        id: msg.id,
        chatId: msg.chat_id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        content: msg.content,
        read: msg.read,
        readAt: msg.read_at,
        createdAt: msg.created_at,
        updatedAt: msg.updated_at,
      }));

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { messages },
          `Retrieved ${messages.length} messages`
        )
      );
    }));

    // Get chat details
    app.get('/api/chats/:matchId', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;

      const result = await pool.query(
        `SELECT c.*, 
                m.user_id, m.matched_user_id,
                u1.first_name AS user1_first_name, u1.last_name AS user1_last_name, u1.avatar_url AS user1_avatar_url,
                u2.first_name AS user2_first_name, u2.last_name AS user2_last_name, u2.avatar_url AS user2_avatar_url
         FROM yeyzer.chats c
         JOIN yeyzer.matches m ON c.match_id = m.id
         JOIN yeyzer.users u1 ON c.user1_id = u1.id
         JOIN yeyzer.users u2 ON c.user2_id = u2.id
         WHERE c.match_id = $1`,
        [matchId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Chat not found', StatusCodes.NOT_FOUND, 'CHAT_NOT_FOUND');
      }

      const chat = result.rows[0];
      res.status(StatusCodes.OK).json(
        createSuccessResponse({
          id: chat.id,
          matchId: chat.match_id,
          user1: {
            id: chat.user1_id,
            firstName: chat.user1_first_name,
            lastName: chat.user1_last_name,
            avatarUrl: chat.user1_avatar_url,
          },
          user2: {
            id: chat.user2_id,
            firstName: chat.user2_first_name,
            lastName: chat.user2_last_name,
            avatarUrl: chat.user2_avatar_url,
          },
          lastMessageAt: chat.last_message_at,
          isActive: chat.is_active,
          createdAt: chat.created_at,
          updatedAt: chat.updated_at,
        })
      );
    }));

    // -------------------- WebSocket Server --------------------

    // Initialize WebSocket server
    const wss = new WebSocketServer({ server: httpServer });

    // Store connections by chat ID
    const connections: Map<string, Set<WebSocket>> = new Map();

    // Handle WebSocket connections
    wss.on('connection', (ws: WebSocket) => {
      let chatId: string | null = null;

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);

          // Handle subscription to a chat
          if (data.type === 'subscribe' && data.chatId) {
            chatId = data.chatId;
            if (!connections.has(chatId)) {
              connections.set(chatId, new Set());
            }
            connections.get(chatId)?.add(ws);
            logger.info({ chatId }, 'Client subscribed to chat');
          }

          // Handle new message (should use REST API instead, but included for completeness)
          if (data.type === 'message' && data.chatId && data.senderId && data.receiverId && data.content) {
            if (containsProfanity(data.content)) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Message contains profanity',
                code: 'PROFANITY_DETECTED',
              }));
              return;
            }

            // Store message in database (async)
            (async () => {
              try {
                const messageId = uuidv4();
                await pool.query(
                  `INSERT INTO yeyzer.messages (id, chat_id, sender_id, receiver_id, content, read)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [messageId, data.chatId, data.senderId, data.receiverId, data.content, false]
                );

                // Update chat's last_message_at
                await pool.query(
                  'UPDATE yeyzer.chats SET last_message_at = NOW() WHERE id = $1',
                  [data.chatId]
                );

                // Broadcast message to all clients in this chat
                broadcastMessage(data.chatId, {
                  id: messageId,
                  chatId: data.chatId,
                  senderId: data.senderId,
                  receiverId: data.receiverId,
                  content: data.content,
                  read: false,
                  createdAt: new Date().toISOString(),
                });
              } catch (err) {
                logger.error({ err }, 'Error storing WebSocket message');
              }
            })();
          }
        } catch (err) {
          logger.error({ err }, 'Error processing WebSocket message');
        }
      });

      ws.on('close', () => {
        if (chatId && connections.has(chatId)) {
          connections.get(chatId)?.delete(ws);
          if (connections.get(chatId)?.size === 0) {
            connections.delete(chatId);
          }
          logger.info({ chatId }, 'Client unsubscribed from chat');
        }
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'info',
        message: 'Connected to Yeyzer Conversation Service',
      }));
    });

    // Broadcast message to all clients subscribed to a chat
    function broadcastMessage(chatId: string, message: any) {
      if (connections.has(chatId)) {
        const clients = connections.get(chatId) || new Set();
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'message',
              message,
            }));
          }
        });
      }
    }

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
      logger.info(`Conversation service listening at http://${HOST}:${PORT}`);
      logger.info(`WebSocket server available at ws://${HOST}:${PORT}`);
    });
    
    logger.info('Conversation service started successfully');
    
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
