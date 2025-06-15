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
  calculateDistance
} from '@yeyzer/utils';
import { MatchStatusEnum } from '@yeyzer/types';
import http from 'http';

// Initialize logger
const logger = createPinoLogger('match-engine-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('match_engine_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4004); // Default to 4004
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

    // -------------------- Match Engine Logic --------------------

    // Helper function to fetch user data for matching
    const fetchUserDataForMatching = async () => {
      const query = `
        SELECT
          u.id AS user_id,
          up.headline,
          up.bio,
          up.city,
          up.state,
          up.country,
          up.latitude,
          up.longitude,
          up.profession,
          up.company,
          up.skills,
          up.interests,
          ip.match_type,
          ip.professional_traits,
          ip.personal_traits,
          ip.skills_desired,
          ip.industry_preferences,
          ip.experience_level_preference,
          ld.industry AS linkedin_industry,
          gd.top_languages AS github_languages
        FROM yeyzer.users u
        LEFT JOIN yeyzer.user_profiles up ON u.id = up.user_id
        LEFT JOIN yeyzer.ideal_personas ip ON u.id = ip.user_id
        LEFT JOIN yeyzer.linkedin_data ld ON u.id = ld.user_id
        LEFT JOIN yeyzer.github_data gd ON u.id = gd.user_id;
      `;
      const result = await pool.query(query);
      return result.rows.map(row => ({
        userId: row.user_id,
        profile: {
          headline: row.headline,
          bio: row.bio,
          city: row.city,
          state: row.state,
          country: row.country,
          latitude: row.latitude,
          longitude: row.longitude,
          profession: row.profession,
          company: row.company,
          skills: row.skills || [],
          interests: row.interests || [],
        },
        persona: {
          matchType: row.match_type,
          professionalTraits: row.professional_traits || [],
          personalTraits: row.personal_traits || [],
          skillsDesired: row.skills_desired || [],
          industryPreferences: row.industry_preferences || [],
          experienceLevelPreference: row.experience_level_preference,
        },
        social: {
          linkedinIndustry: row.linkedin_industry,
          githubLanguages: row.github_languages || [],
        }
      }));
    };

    // Simplified in-memory matching algorithm
    const calculateMatches = async (targetUserId?: string) => {
      logger.info({ targetUserId }, 'Starting match calculation...');
      const allUsersData = await fetchUserDataForMatching();
      const matchesToInsert: any[] = [];

      const usersToProcess = targetUserId
        ? allUsersData.filter(u => u.userId === targetUserId)
        : allUsersData;

      for (const user of usersToProcess) {
        if (!user.persona || !user.profile) {
          logger.warn(`Skipping user ${user.userId} due to missing persona or profile data.`);
          continue;
        }

        for (const candidate of allUsersData) {
          if (user.userId === candidate.userId || !candidate.persona || !candidate.profile) {
            continue;
          }

          let scoreOverall = 0;
          let scoreProfessionalFit = 0;
          let scorePersonalFit = 0;
          let scoreSkillsAlignment = 0;
          let scoreIndustryAlignment = 0;
          let scoreExperienceCompatibility = 0;

          // 1. Skills Overlap (50% weight)
          const userSkills = new Set(user.profile.skills);
          const candidateSkills = new Set(candidate.profile.skills);
          const desiredSkills = new Set(user.persona.skillsDesired);

          const commonSkillsWithCandidate = [...userSkills].filter(skill => candidateSkills.has(skill)).length;
          const candidateSkillsMatchingDesired = [...candidateSkills].filter(skill => desiredSkills.has(skill)).length;

          const maxPossibleSkills = Math.max(userSkills.size, candidateSkills.size, desiredSkills.size);
          if (maxPossibleSkills > 0) {
            scoreSkillsAlignment = (commonSkillsWithCandidate + candidateSkillsMatchingDesired) / (2 * maxPossibleSkills);
          }

          // 2. Industry Similarity (20% weight)
          const userIndustries = new Set(user.persona.industryPreferences);
          const candidateIndustry = candidate.social.linkedinIndustry;
          if (candidateIndustry && userIndustries.has(candidateIndustry)) {
            scoreIndustryAlignment = 1.0;
          } else {
            scoreIndustryAlignment = 0.2; // Small base if no direct match
          }

          // 3. Location Proximity (10% weight) - Simplified
          if (user.profile.city && candidate.profile.city && user.profile.city === candidate.profile.city) {
            scoreProfessionalFit += 0.5; // Boost for same city
            if (user.profile.state && candidate.profile.state && user.profile.state === candidate.profile.state) {
              scoreProfessionalFit += 0.5; // Further boost for same state
            }
          } else if (user.profile.state && candidate.profile.state && user.profile.state === candidate.profile.state) {
            scoreProfessionalFit += 0.3; // Smaller boost for just same state
          } else if (user.profile.latitude && user.profile.longitude && 
                     candidate.profile.latitude && candidate.profile.longitude) {
            // Calculate distance if coordinates are available
            const distance = calculateDistance(
              user.profile.latitude, 
              user.profile.longitude, 
              candidate.profile.latitude, 
              candidate.profile.longitude
            );
            
            // Score based on distance (closer = higher score)
            // Within 10km = 0.8, within 25km = 0.6, within 50km = 0.4, within 100km = 0.2
            if (distance <= 10) {
              scoreProfessionalFit += 0.8;
            } else if (distance <= 25) {
              scoreProfessionalFit += 0.6;
            } else if (distance <= 50) {
              scoreProfessionalFit += 0.4;
            } else if (distance <= 100) {
              scoreProfessionalFit += 0.2;
            }
          }
          
          // Normalize professional fit score to 0-1 range
          scoreProfessionalFit = Math.min(1, scoreProfessionalFit);

          // 4. Complement vs. Mirror (20% weight) - Simplified
          if (user.persona.matchType === 'COMPLEMENT') {
            // For complement, we want different skills and traits
            const differentSkills = 1 - (commonSkillsWithCandidate / Math.max(userSkills.size, 1));
            
            // Different profession is good for complement
            const differentProfession = user.profile.profession !== candidate.profile.profession ? 1 : 0;
            
            // Calculate personal fit for complement
            scorePersonalFit = (differentSkills * 0.7) + (differentProfession * 0.3);
          } else if (user.persona.matchType === 'MIRROR') {
            // For mirror, we want similar skills and traits
            const similarSkills = commonSkillsWithCandidate / Math.max(userSkills.size, 1);
            
            // Same profession is good for mirror
            const sameProfession = user.profile.profession === candidate.profile.profession ? 1 : 0;
            
            // Calculate personal fit for mirror
            scorePersonalFit = (similarSkills * 0.7) + (sameProfession * 0.3);
          } else {
            // Default to middle score if match_type is not specified
            scorePersonalFit = 0.5;
          }

          // 5. Experience compatibility (bonus factor)
          // Simple check if candidate's experience level matches user's preference
          if (user.persona.experienceLevelPreference === 'ANY' || 
              user.persona.experienceLevelPreference === candidate.persona.experienceLevelPreference) {
            scoreExperienceCompatibility = 1.0;
          } else {
            scoreExperienceCompatibility = 0.5;
          }

          // Combine sub-scores for overall score
          scoreOverall = (
            scoreSkillsAlignment * 0.5 +
            scoreIndustryAlignment * 0.2 +
            scoreProfessionalFit * 0.1 +
            scorePersonalFit * 0.2
          );

          // Apply experience compatibility as a multiplier
          scoreOverall *= (0.8 + (scoreExperienceCompatibility * 0.2));

          // Ensure scores are between 0 and 1
          scoreOverall = Math.min(1, Math.max(0, scoreOverall));
          scoreProfessionalFit = Math.min(1, Math.max(0, scoreProfessionalFit));
          scorePersonalFit = Math.min(1, Math.max(0, scorePersonalFit));
          scoreSkillsAlignment = Math.min(1, Math.max(0, scoreSkillsAlignment));
          scoreIndustryAlignment = Math.min(1, Math.max(0, scoreIndustryAlignment));
          scoreExperienceCompatibility = Math.min(1, Math.max(0, scoreExperienceCompatibility));

          // Only consider matches above a certain threshold
          const MATCH_THRESHOLD = getEnvNumber('MATCH_SCORING_THRESHOLD', 0.5);
          if (scoreOverall >= MATCH_THRESHOLD) {
            matchesToInsert.push({
              userId: user.userId,
              matchedUserId: candidate.userId,
              scoreOverall,
              scoreProfessionalFit,
              scorePersonalFit,
              scoreSkillsAlignment,
              scoreIndustryAlignment,
              scoreExperienceCompatibility,
              scoreDetails: {
                skillsOverlap: scoreSkillsAlignment.toFixed(2),
                industryMatch: scoreIndustryAlignment.toFixed(2),
                locationMatch: scoreProfessionalFit.toFixed(2),
                personaMatch: scorePersonalFit.toFixed(2),
              },
            });
          }
        }
      }

      // Store matches in DB
      for (const match of matchesToInsert) {
        const matchId = uuidv4();
        await pool.query(
          `INSERT INTO yeyzer.matches (
            id, user_id, matched_user_id, status, score_overall,
            score_professional_fit, score_personal_fit, score_skills_alignment,
            score_industry_alignment, score_experience_compatibility,
            score_details, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
          ON CONFLICT (user_id, matched_user_id) DO UPDATE SET
            status = CASE WHEN yeyzer.matches.status IN ('ACCEPTED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED') 
                          THEN yeyzer.matches.status ELSE 'PENDING' END,
            score_overall = $5,
            score_professional_fit = $6,
            score_personal_fit = $7,
            score_skills_alignment = $8,
            score_industry_alignment = $9,
            score_experience_compatibility = $10,
            score_details = $11,
            updated_at = NOW()
          RETURNING id`,
          [
            matchId,
            match.userId,
            match.matchedUserId,
            'PENDING',
            match.scoreOverall,
            match.scoreProfessionalFit,
            match.scorePersonalFit,
            match.scoreSkillsAlignment,
            match.scoreIndustryAlignment,
            match.scoreExperienceCompatibility,
            JSON.stringify(match.scoreDetails),
          ]
        );
      }

      logger.info({ matchCount: matchesToInsert.length }, 'Match calculation completed');
      return matchesToInsert.length;
    };

    // -------------------- API Routes --------------------

    // Calculate matches for a specific user
    app.post('/api/matches/calculate/:userId', asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;
      
      // Check if userId is defined before validation
      if (!userId) {
        throw new AppError('User ID is required', StatusCodes.BAD_REQUEST, 'MISSING_USER_ID');
      }
      
      // Validate UUID format
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new AppError('Invalid user ID format', StatusCodes.BAD_REQUEST, 'INVALID_USER_ID');
      }

      // Check if user exists
      const userResult = await pool.query('SELECT id FROM yeyzer.users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        throw new AppError('User not found', StatusCodes.NOT_FOUND, 'USER_NOT_FOUND');
      }

      // Calculate matches for this user
      const matchCount = await calculateMatches(userId);

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { matchCount },
          `Successfully calculated ${matchCount} matches for user`
        )
      );
    }));

    // Get all matches for a user
    app.get('/api/matches/:userId', asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;
      const { status } = req.query;
      
      // Check if userId is defined before validation
      if (!userId) {
        throw new AppError('User ID is required', StatusCodes.BAD_REQUEST, 'MISSING_USER_ID');
      }
      
      // Validate UUID format
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new AppError('Invalid user ID format', StatusCodes.BAD_REQUEST, 'INVALID_USER_ID');
      }

      // Build query based on status filter
      let query = `
        SELECT m.*, 
               u.first_name AS matched_user_first_name, 
               u.last_name AS matched_user_last_name,
               u.avatar_url AS matched_user_avatar_url,
               up.headline AS matched_user_headline,
               up.profession AS matched_user_profession,
               up.company AS matched_user_company
        FROM yeyzer.matches m
        JOIN yeyzer.users u ON m.matched_user_id = u.id
        LEFT JOIN yeyzer.user_profiles up ON m.matched_user_id = up.user_id
        WHERE m.user_id = $1
      `;
      
      const queryParams = [userId];
      
      if (status && Object.values(MatchStatusEnum).includes(status as any)) {
        query += ' AND m.status = $2';
        queryParams.push(status as string);
      }
      
      query += ' ORDER BY m.score_overall DESC';

      const result = await pool.query(query, queryParams);

      // Transform the data to match the expected format
      const matches = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        matchedUserId: row.matched_user_id,
        matchedUser: {
          firstName: row.matched_user_first_name,
          lastName: row.matched_user_last_name,
          avatarUrl: row.matched_user_avatar_url,
          headline: row.matched_user_headline,
          profession: row.matched_user_profession,
          company: row.matched_user_company
        },
        status: row.status,
        score: {
          overall: row.score_overall,
          professionalFit: row.score_professional_fit,
          personalFit: row.score_personal_fit,
          skillsAlignment: row.score_skills_alignment,
          industryAlignment: row.score_industry_alignment,
          experienceCompatibility: row.score_experience_compatibility,
          details: row.score_details
        },
        scheduledTime: row.scheduled_time,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { matches },
          `Retrieved ${matches.length} matches for user`
        )
      );
    }));

    // Get specific match details
    app.get('/api/matches/:userId/:matchedUserId', asyncHandler(async (req: Request, res: Response) => {
      const { userId, matchedUserId } = req.params;
      
      // Check if userId and matchedUserId are defined before validation
      if (!userId) {
        throw new AppError('User ID is required', StatusCodes.BAD_REQUEST, 'MISSING_USER_ID');
      }
      
      if (!matchedUserId) {
        throw new AppError('Matched User ID is required', StatusCodes.BAD_REQUEST, 'MISSING_MATCHED_USER_ID');
      }
      
      // Validate UUID format
      if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) || 
          !matchedUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new AppError('Invalid user ID format', StatusCodes.BAD_REQUEST, 'INVALID_USER_ID');
      }

      const query = `
        SELECT m.*, 
               u1.first_name AS user_first_name, 
               u1.last_name AS user_last_name,
               u1.avatar_url AS user_avatar_url,
               up1.headline AS user_headline,
               up1.profession AS user_profession,
               up1.company AS user_company,
               u2.first_name AS matched_user_first_name, 
               u2.last_name AS matched_user_last_name,
               u2.avatar_url AS matched_user_avatar_url,
               up2.headline AS matched_user_headline,
               up2.profession AS matched_user_profession,
               up2.company AS matched_user_company
        FROM yeyzer.matches m
        JOIN yeyzer.users u1 ON m.user_id = u1.id
        JOIN yeyzer.users u2 ON m.matched_user_id = u2.id
        LEFT JOIN yeyzer.user_profiles up1 ON m.user_id = up1.user_id
        LEFT JOIN yeyzer.user_profiles up2 ON m.matched_user_id = up2.user_id
        WHERE m.user_id = $1 AND m.matched_user_id = $2
      `;

      const result = await pool.query(query, [userId, matchedUserId]);

      if (result.rows.length === 0) {
        throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
      }

      const row = result.rows[0];
      
      // Transform the data to match the expected format
      const match = {
        id: row.id,
        userId: row.user_id,
        user: {
          firstName: row.user_first_name,
          lastName: row.user_last_name,
          avatarUrl: row.user_avatar_url,
          headline: row.user_headline,
          profession: row.user_profession,
          company: row.user_company
        },
        matchedUserId: row.matched_user_id,
        matchedUser: {
          firstName: row.matched_user_first_name,
          lastName: row.matched_user_last_name,
          avatarUrl: row.matched_user_avatar_url,
          headline: row.matched_user_headline,
          profession: row.matched_user_profession,
          company: row.matched_user_company
        },
        status: row.status,
        score: {
          overall: row.score_overall,
          professionalFit: row.score_professional_fit,
          personalFit: row.score_personal_fit,
          skillsAlignment: row.score_skills_alignment,
          industryAlignment: row.score_industry_alignment,
          experienceCompatibility: row.score_experience_compatibility,
          details: row.score_details
        },
        scheduledTime: row.scheduled_time,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { match },
          'Match details retrieved successfully'
        )
      );
    }));

    // Accept a match
    app.post('/api/matches/:matchId/accept', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;
      
      // Check if matchId is defined before validation
      if (!matchId) {
        throw new AppError('Match ID is required', StatusCodes.BAD_REQUEST, 'MISSING_MATCH_ID');
      }
      
      // Validate UUID format
      if (!matchId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new AppError('Invalid match ID format', StatusCodes.BAD_REQUEST, 'INVALID_MATCH_ID');
      }

      // Check if match exists
      const matchResult = await pool.query('SELECT * FROM yeyzer.matches WHERE id = $1', [matchId]);
      if (matchResult.rows.length === 0) {
        throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
      }

      // Update match status to ACCEPTED
      await pool.query(
        'UPDATE yeyzer.matches SET status = $1, updated_at = NOW() WHERE id = $2',
        ['ACCEPTED', matchId]
      );

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { matchId },
          'Match accepted successfully'
        )
      );
    }));

    // Reject a match
    app.post('/api/matches/:matchId/reject', asyncHandler(async (req: Request, res: Response) => {
      const { matchId } = req.params;
      
      // Check if matchId is defined before validation
      if (!matchId) {
        throw new AppError('Match ID is required', StatusCodes.BAD_REQUEST, 'MISSING_MATCH_ID');
      }
      
      // Validate UUID format
      if (!matchId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        throw new AppError('Invalid match ID format', StatusCodes.BAD_REQUEST, 'INVALID_MATCH_ID');
      }

      // Check if match exists
      const matchResult = await pool.query('SELECT * FROM yeyzer.matches WHERE id = $1', [matchId]);
      if (matchResult.rows.length === 0) {
        throw new AppError('Match not found', StatusCodes.NOT_FOUND, 'MATCH_NOT_FOUND');
      }

      // Update match status to REJECTED
      await pool.query(
        'UPDATE yeyzer.matches SET status = $1, updated_at = NOW() WHERE id = $2',
        ['REJECTED', matchId]
      );

      res.status(StatusCodes.OK).json(
        createSuccessResponse(
          { matchId },
          'Match rejected successfully'
        )
      );
    }));

    // -------------------- Cron Jobs --------------------

    // Commented out for MVP as requested
    /*
    // Schedule nightly match recalculation
    cron.schedule(getEnv('MATCH_REFRESH_CRON', '0 0 * * *'), async () => {
      logger.info('Starting scheduled match recalculation');
      try {
        const matchCount = await calculateMatches();
        logger.info({ matchCount }, 'Scheduled match recalculation completed');
      } catch (err) {
        logger.error({ err }, 'Error during scheduled match recalculation');
      }
    });
    */

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
      logger.info(`Match Engine service listening at http://${HOST}:${PORT}`);
    });
    
    logger.info('Match Engine service started successfully');
    
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
