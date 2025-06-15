import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import morgan from 'morgan';
import { StatusCodes } from 'http-status-codes';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { gql } from 'graphql-tag';
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
  UserProfileSchema,
  IdealPersonaSchema,
  UserSchema,
} from '@yeyzer/types';
import { z } from 'zod';
import http from 'http';
import pinoHttp from 'pino-http';

// Initialize logger
const logger = createPinoLogger('profile-service');
const httpLogger = pinoHttp({ logger });

// Initialize metrics
const metrics = initializeMetrics('profile_service');

// Initialize Express app
const app = express();
const PORT = getEnvNumber('PORT', 4003); // Default to 4003 as per instructions
const HOST = getEnv('HOST', '0.0.0.0');

// Create HTTP server for Apollo Server
const httpServer = http.createServer(app);

// Database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  min: getEnvNumber('DATABASE_POOL_MIN', 2),
  max: getEnvNumber('DATABASE_POOL_MAX', 10),
});

// -------------------- CORS --------------------
// Define CORS configuration early so it's in scope for all later uses
const corsOptions = {
  origin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
  credentials: true,
  optionsSuccessStatus: 200,
};

// GraphQL Schema
const typeDefs = gql`
  scalar UUID
  scalar JSON
  scalar DateTime

  enum MatchType {
    COMPLEMENT
    MIRROR
  }

  enum ExperienceLevelPreference {
    ENTRY_LEVEL
    MID_LEVEL
    SENIOR
    EXECUTIVE
    ANY
  }

  enum MeetingPreference {
    COFFEE
    LUNCH
    DINNER
    DRINKS
    VIRTUAL
    ANY
  }

  enum MeetingFrequencyPreference {
    ONE_TIME
    WEEKLY
    MONTHLY
    QUARTERLY
    OPEN
  }

  type User {
    id: UUID!
    email: String
    firstName: String
    lastName: String
    avatarUrl: String
  }

  type Location {
    city: String
    state: String
    country: String
    coordinates: Coordinates
  }

  type Coordinates {
    latitude: Float
    longitude: Float
  }

  type Education {
    institution: String!
    degree: String
    field: String
    startYear: Int
    endYear: Int
    current: Boolean
  }

  type Experience {
    title: String!
    company: String!
    description: String
    startDate: DateTime
    endDate: DateTime
    current: Boolean
  }

  type PrivacySettings {
    showLinkedIn: Boolean
    showGitHub: Boolean
    showTwitter: Boolean
    showCrunchbase: Boolean
  }

  type UserProfile {
    userId: UUID!
    user: User
    headline: String
    bio: String
    location: Location
    profession: String
    company: String
    skills: [String!]!
    interests: [String!]!
    education: [Education!]!
    experience: [Experience!]!
    privacySettings: PrivacySettings!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type IdealPersona {
    userId: UUID!
    user: User
    matchType: MatchType!
    professionalTraits: [String!]!
    personalTraits: [String!]!
    skillsDesired: [String!]!
    industryPreferences: [String!]!
    experienceLevelPreference: ExperienceLevelPreference!
    meetingPreferences: [MeetingPreference!]!
    meetingFrequencyPreference: MeetingFrequencyPreference!
    description: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CoordinatesInput {
    latitude: Float!
    longitude: Float!
  }

  input LocationInput {
    city: String
    state: String
    country: String
    coordinates: CoordinatesInput
  }

  input EducationInput {
    institution: String!
    degree: String
    field: String
    startYear: Int
    endYear: Int
    current: Boolean
  }

  input ExperienceInput {
    title: String!
    company: String!
    description: String
    startDate: DateTime
    endDate: DateTime
    current: Boolean
  }

  input PrivacySettingsInput {
    showLinkedIn: Boolean
    showGitHub: Boolean
    showTwitter: Boolean
    showCrunchbase: Boolean
  }

  input UpdateUserProfileInput {
    userId: UUID!
    headline: String
    bio: String
    location: LocationInput
    profession: String
    company: String
    skills: [String!]
    interests: [String!]
    education: [EducationInput!]
    experience: [ExperienceInput!]
    privacySettings: PrivacySettingsInput
  }

  input UpdateIdealPersonaInput {
    userId: UUID!
    matchType: MatchType
    professionalTraits: [String!]
    personalTraits: [String!]
    skillsDesired: [String!]
    industryPreferences: [String!]
    experienceLevelPreference: ExperienceLevelPreference
    meetingPreferences: [MeetingPreference!]
    meetingFrequencyPreference: MeetingFrequencyPreference
    description: String
  }

  type Query {
    getProfile(userId: UUID!): UserProfile
    getUserProfiles: [UserProfile!]!
    getIdealPersona(userId: UUID!): IdealPersona
  }

  type Mutation {
    updateUserProfile(input: UpdateUserProfileInput!): UserProfile!
    updateIdealPersona(input: UpdateIdealPersonaInput!): IdealPersona!
  }
`;

// Resolvers
const resolvers = {
  Query: {
    getProfile: async (_: any, { userId }: { userId: string }) => {
      try {
        const result = await pool.query(
          'SELECT * FROM yeyzer.user_profiles WHERE user_id = $1',
          [userId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const profile = result.rows[0];
        
        // Transform the data to match the GraphQL schema
        return {
          userId: profile.user_id,
          headline: profile.headline,
          bio: profile.bio,
          location: {
            city: profile.city,
            state: profile.state,
            country: profile.country,
            coordinates: {
              latitude: profile.latitude,
              longitude: profile.longitude,
            },
          },
          profession: profile.profession,
          company: profile.company,
          skills: profile.skills || [],
          interests: profile.interests || [],
          education: profile.education || [],
          experience: profile.experience || [],
          privacySettings: profile.privacy_settings || {
            showLinkedIn: true,
            showGitHub: true,
            showTwitter: true,
            showCrunchbase: true,
          },
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        };
      } catch (err) {
        logger.error({ err, userId }, 'Failed to get user profile');
        throw new Error('Failed to get user profile');
      }
    },
    
    getUserProfiles: async () => {
      try {
        const result = await pool.query('SELECT * FROM yeyzer.user_profiles');
        
        return result.rows.map(profile => ({
          userId: profile.user_id,
          headline: profile.headline,
          bio: profile.bio,
          location: {
            city: profile.city,
            state: profile.state,
            country: profile.country,
            coordinates: {
              latitude: profile.latitude,
              longitude: profile.longitude,
            },
          },
          profession: profile.profession,
          company: profile.company,
          skills: profile.skills || [],
          interests: profile.interests || [],
          education: profile.education || [],
          experience: profile.experience || [],
          privacySettings: profile.privacy_settings || {
            showLinkedIn: true,
            showGitHub: true,
            showTwitter: true,
            showCrunchbase: true,
          },
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        }));
      } catch (err) {
        logger.error({ err }, 'Failed to get user profiles');
        throw new Error('Failed to get user profiles');
      }
    },
    
    getIdealPersona: async (_: any, { userId }: { userId: string }) => {
      try {
        const result = await pool.query(
          'SELECT * FROM yeyzer.ideal_personas WHERE user_id = $1',
          [userId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const persona = result.rows[0];
        
        // Transform the data to match the GraphQL schema
        return {
          userId: persona.user_id,
          matchType: persona.match_type,
          professionalTraits: persona.professional_traits || [],
          personalTraits: persona.personal_traits || [],
          skillsDesired: persona.skills_desired || [],
          industryPreferences: persona.industry_preferences || [],
          experienceLevelPreference: persona.experience_level_preference,
          meetingPreferences: persona.meeting_preferences || [],
          meetingFrequencyPreference: persona.meeting_frequency_preference,
          description: persona.description,
          createdAt: persona.created_at,
          updatedAt: persona.updated_at,
        };
      } catch (err) {
        logger.error({ err, userId }, 'Failed to get ideal persona');
        throw new Error('Failed to get ideal persona');
      }
    },
  },
  
  Mutation: {
    updateUserProfile: async (_: any, { input }: { input: any }) => {
      const { userId, ...profileData } = input;
      
      try {
        // Check if profile exists
        const existingResult = await pool.query(
          'SELECT * FROM yeyzer.user_profiles WHERE user_id = $1',
          [userId]
        );
        
        const updateFields = [];
        const updateValues = [];
        let valueIndex = 1;
        
        // Build dynamic update query
        if (profileData.headline !== undefined) {
          updateFields.push(`headline = $${valueIndex}`);
          updateValues.push(profileData.headline);
          valueIndex++;
        }
        
        if (profileData.bio !== undefined) {
          updateFields.push(`bio = $${valueIndex}`);
          updateValues.push(profileData.bio);
          valueIndex++;
        }
        
        if (profileData.location?.city !== undefined) {
          updateFields.push(`city = $${valueIndex}`);
          updateValues.push(profileData.location.city);
          valueIndex++;
        }
        
        if (profileData.location?.state !== undefined) {
          updateFields.push(`state = $${valueIndex}`);
          updateValues.push(profileData.location.state);
          valueIndex++;
        }
        
        if (profileData.location?.country !== undefined) {
          updateFields.push(`country = $${valueIndex}`);
          updateValues.push(profileData.location.country);
          valueIndex++;
        }
        
        if (profileData.location?.coordinates?.latitude !== undefined) {
          updateFields.push(`latitude = $${valueIndex}`);
          updateValues.push(profileData.location.coordinates.latitude);
          valueIndex++;
        }
        
        if (profileData.location?.coordinates?.longitude !== undefined) {
          updateFields.push(`longitude = $${valueIndex}`);
          updateValues.push(profileData.location.coordinates.longitude);
          valueIndex++;
        }
        
        if (profileData.profession !== undefined) {
          updateFields.push(`profession = $${valueIndex}`);
          updateValues.push(profileData.profession);
          valueIndex++;
        }
        
        if (profileData.company !== undefined) {
          updateFields.push(`company = $${valueIndex}`);
          updateValues.push(profileData.company);
          valueIndex++;
        }
        
        if (profileData.skills !== undefined) {
          updateFields.push(`skills = $${valueIndex}`);
          updateValues.push(JSON.stringify(profileData.skills));
          valueIndex++;
        }
        
        if (profileData.interests !== undefined) {
          updateFields.push(`interests = $${valueIndex}`);
          updateValues.push(JSON.stringify(profileData.interests));
          valueIndex++;
        }
        
        if (profileData.education !== undefined) {
          updateFields.push(`education = $${valueIndex}`);
          updateValues.push(JSON.stringify(profileData.education));
          valueIndex++;
        }
        
        if (profileData.experience !== undefined) {
          updateFields.push(`experience = $${valueIndex}`);
          updateValues.push(JSON.stringify(profileData.experience));
          valueIndex++;
        }
        
        if (profileData.privacySettings !== undefined) {
          updateFields.push(`privacy_settings = $${valueIndex}`);
          updateValues.push(JSON.stringify(profileData.privacySettings));
          valueIndex++;
        }
        
        // Always update the updated_at timestamp
        updateFields.push(`updated_at = NOW()`);
        
        // Add userId as the last parameter
        updateValues.push(userId);
        
        let result;
        if (existingResult.rows.length === 0) {
          // Profile doesn't exist, create it
          const insertFields = ['user_id'];
          const insertPlaceholders = ['$1'];
          const insertValues = [userId];
          let insertIndex = 2;
          
          if (profileData.headline !== undefined) {
            insertFields.push('headline');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.headline);
            insertIndex++;
          }
          
          if (profileData.bio !== undefined) {
            insertFields.push('bio');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.bio);
            insertIndex++;
          }
          
          if (profileData.location?.city !== undefined) {
            insertFields.push('city');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.location.city);
            insertIndex++;
          }
          
          if (profileData.location?.state !== undefined) {
            insertFields.push('state');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.location.state);
            insertIndex++;
          }
          
          if (profileData.location?.country !== undefined) {
            insertFields.push('country');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.location.country);
            insertIndex++;
          }
          
          if (profileData.location?.coordinates?.latitude !== undefined) {
            insertFields.push('latitude');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.location.coordinates.latitude);
            insertIndex++;
          }
          
          if (profileData.location?.coordinates?.longitude !== undefined) {
            insertFields.push('longitude');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.location.coordinates.longitude);
            insertIndex++;
          }
          
          if (profileData.profession !== undefined) {
            insertFields.push('profession');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.profession);
            insertIndex++;
          }
          
          if (profileData.company !== undefined) {
            insertFields.push('company');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(profileData.company);
            insertIndex++;
          }
          
          if (profileData.skills !== undefined) {
            insertFields.push('skills');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(profileData.skills));
            insertIndex++;
          }
          
          if (profileData.interests !== undefined) {
            insertFields.push('interests');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(profileData.interests));
            insertIndex++;
          }
          
          if (profileData.education !== undefined) {
            insertFields.push('education');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(profileData.education));
            insertIndex++;
          }
          
          if (profileData.experience !== undefined) {
            insertFields.push('experience');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(profileData.experience));
            insertIndex++;
          }
          
          if (profileData.privacySettings !== undefined) {
            insertFields.push('privacy_settings');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(profileData.privacySettings));
            insertIndex++;
          }
          
          // Add created_at and updated_at
          insertFields.push('created_at', 'updated_at');
          insertPlaceholders.push('NOW()', 'NOW()');
          
          const insertQuery = `
            INSERT INTO yeyzer.user_profiles (${insertFields.join(', ')})
            VALUES (${insertPlaceholders.join(', ')})
            RETURNING *
          `;
          
          result = await pool.query(insertQuery, insertValues);
        } else {
          // Profile exists, update it
          const updateQuery = `
            UPDATE yeyzer.user_profiles
            SET ${updateFields.join(', ')}
            WHERE user_id = $${valueIndex}
            RETURNING *
          `;
          
          result = await pool.query(updateQuery, updateValues);
        }
        
        const updatedProfile = result.rows[0];
        
        // Transform the data to match the GraphQL schema
        return {
          userId: updatedProfile.user_id,
          headline: updatedProfile.headline,
          bio: updatedProfile.bio,
          location: {
            city: updatedProfile.city,
            state: updatedProfile.state,
            country: updatedProfile.country,
            coordinates: {
              latitude: updatedProfile.latitude,
              longitude: updatedProfile.longitude,
            },
          },
          profession: updatedProfile.profession,
          company: updatedProfile.company,
          skills: updatedProfile.skills || [],
          interests: updatedProfile.interests || [],
          education: updatedProfile.education || [],
          experience: updatedProfile.experience || [],
          privacySettings: updatedProfile.privacy_settings || {
            showLinkedIn: true,
            showGitHub: true,
            showTwitter: true,
            showCrunchbase: true,
          },
          createdAt: updatedProfile.created_at,
          updatedAt: updatedProfile.updated_at,
        };
      } catch (err) {
        logger.error({ err, userId }, 'Failed to update user profile');
        throw new Error('Failed to update user profile');
      }
    },
    
    updateIdealPersona: async (_: any, { input }: { input: any }) => {
      const { userId, ...personaData } = input;
      
      try {
        // Check if persona exists
        const existingResult = await pool.query(
          'SELECT * FROM yeyzer.ideal_personas WHERE user_id = $1',
          [userId]
        );
        
        const updateFields = [];
        const updateValues = [];
        let valueIndex = 1;
        
        // Build dynamic update query
        if (personaData.matchType !== undefined) {
          updateFields.push(`match_type = $${valueIndex}`);
          updateValues.push(personaData.matchType);
          valueIndex++;
        }
        
        if (personaData.professionalTraits !== undefined) {
          updateFields.push(`professional_traits = $${valueIndex}`);
          updateValues.push(JSON.stringify(personaData.professionalTraits));
          valueIndex++;
        }
        
        if (personaData.personalTraits !== undefined) {
          updateFields.push(`personal_traits = $${valueIndex}`);
          updateValues.push(JSON.stringify(personaData.personalTraits));
          valueIndex++;
        }
        
        if (personaData.skillsDesired !== undefined) {
          updateFields.push(`skills_desired = $${valueIndex}`);
          updateValues.push(JSON.stringify(personaData.skillsDesired));
          valueIndex++;
        }
        
        if (personaData.industryPreferences !== undefined) {
          updateFields.push(`industry_preferences = $${valueIndex}`);
          updateValues.push(JSON.stringify(personaData.industryPreferences));
          valueIndex++;
        }
        
        if (personaData.experienceLevelPreference !== undefined) {
          updateFields.push(`experience_level_preference = $${valueIndex}`);
          updateValues.push(personaData.experienceLevelPreference);
          valueIndex++;
        }
        
        if (personaData.meetingPreferences !== undefined) {
          updateFields.push(`meeting_preferences = $${valueIndex}`);
          updateValues.push(JSON.stringify(personaData.meetingPreferences));
          valueIndex++;
        }
        
        if (personaData.meetingFrequencyPreference !== undefined) {
          updateFields.push(`meeting_frequency_preference = $${valueIndex}`);
          updateValues.push(personaData.meetingFrequencyPreference);
          valueIndex++;
        }
        
        if (personaData.description !== undefined) {
          updateFields.push(`description = $${valueIndex}`);
          updateValues.push(personaData.description);
          valueIndex++;
        }
        
        // Always update the updated_at timestamp
        updateFields.push(`updated_at = NOW()`);
        
        // Add userId as the last parameter
        updateValues.push(userId);
        
        let result;
        if (existingResult.rows.length === 0) {
          // Persona doesn't exist, create it
          const insertFields = ['user_id'];
          const insertPlaceholders = ['$1'];
          const insertValues = [userId];
          let insertIndex = 2;
          
          if (personaData.matchType !== undefined) {
            insertFields.push('match_type');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(personaData.matchType);
            insertIndex++;
          } else {
            // Default value for match_type
            insertFields.push('match_type');
            insertPlaceholders.push('\'COMPLEMENT\'');
          }
          
          if (personaData.professionalTraits !== undefined) {
            insertFields.push('professional_traits');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(personaData.professionalTraits));
            insertIndex++;
          } else {
            // Default empty array
            insertFields.push('professional_traits');
            insertPlaceholders.push('\'[]\'');
          }
          
          if (personaData.personalTraits !== undefined) {
            insertFields.push('personal_traits');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(personaData.personalTraits));
            insertIndex++;
          } else {
            // Default empty array
            insertFields.push('personal_traits');
            insertPlaceholders.push('\'[]\'');
          }
          
          if (personaData.skillsDesired !== undefined) {
            insertFields.push('skills_desired');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(personaData.skillsDesired));
            insertIndex++;
          } else {
            // Default empty array
            insertFields.push('skills_desired');
            insertPlaceholders.push('\'[]\'');
          }
          
          if (personaData.industryPreferences !== undefined) {
            insertFields.push('industry_preferences');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(personaData.industryPreferences));
            insertIndex++;
          } else {
            // Default empty array
            insertFields.push('industry_preferences');
            insertPlaceholders.push('\'[]\'');
          }
          
          if (personaData.experienceLevelPreference !== undefined) {
            insertFields.push('experience_level_preference');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(personaData.experienceLevelPreference);
            insertIndex++;
          } else {
            // Default value
            insertFields.push('experience_level_preference');
            insertPlaceholders.push('\'ANY\'');
          }
          
          if (personaData.meetingPreferences !== undefined) {
            insertFields.push('meeting_preferences');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(JSON.stringify(personaData.meetingPreferences));
            insertIndex++;
          } else {
            // Default value
            insertFields.push('meeting_preferences');
            insertPlaceholders.push('\'["ANY"]\'');
          }
          
          if (personaData.meetingFrequencyPreference !== undefined) {
            insertFields.push('meeting_frequency_preference');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(personaData.meetingFrequencyPreference);
            insertIndex++;
          } else {
            // Default value
            insertFields.push('meeting_frequency_preference');
            insertPlaceholders.push('\'OPEN\'');
          }
          
          if (personaData.description !== undefined) {
            insertFields.push('description');
            insertPlaceholders.push(`$${insertIndex}`);
            insertValues.push(personaData.description);
            insertIndex++;
          }
          
          // Add created_at and updated_at
          insertFields.push('created_at', 'updated_at');
          insertPlaceholders.push('NOW()', 'NOW()');
          
          const insertQuery = `
            INSERT INTO yeyzer.ideal_personas (${insertFields.join(', ')})
            VALUES (${insertPlaceholders.join(', ')})
            RETURNING *
          `;
          
          result = await pool.query(insertQuery, insertValues);
        } else {
          // Persona exists, update it
          const updateQuery = `
            UPDATE yeyzer.ideal_personas
            SET ${updateFields.join(', ')}
            WHERE user_id = $${valueIndex}
            RETURNING *
          `;
          
          result = await pool.query(updateQuery, updateValues);
        }
        
        const updatedPersona = result.rows[0];
        
        // Transform the data to match the GraphQL schema
        return {
          userId: updatedPersona.user_id,
          matchType: updatedPersona.match_type,
          professionalTraits: updatedPersona.professional_traits || [],
          personalTraits: updatedPersona.personal_traits || [],
          skillsDesired: updatedPersona.skills_desired || [],
          industryPreferences: updatedPersona.industry_preferences || [],
          experienceLevelPreference: updatedPersona.experience_level_preference,
          meetingPreferences: updatedPersona.meeting_preferences || [],
          meetingFrequencyPreference: updatedPersona.meeting_frequency_preference,
          description: updatedPersona.description,
          createdAt: updatedPersona.created_at,
          updatedAt: updatedPersona.updated_at,
        };
      } catch (err) {
        logger.error({ err, userId }, 'Failed to update ideal persona');
        throw new Error('Failed to update ideal persona');
      }
    },
  },
  
  UserProfile: {
    user: async (parent: any) => {
      try {
        const result = await pool.query(
          'SELECT * FROM yeyzer.users WHERE id = $1',
          [parent.userId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const user = result.rows[0];
        
        return {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          avatarUrl: user.avatar_url,
        };
      } catch (err) {
        logger.error({ err, userId: parent.userId }, 'Failed to get user');
        throw new Error('Failed to get user');
      }
    },
  },
  
  IdealPersona: {
    user: async (parent: any) => {
      try {
        const result = await pool.query(
          'SELECT * FROM yeyzer.users WHERE id = $1',
          [parent.userId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const user = result.rows[0];
        
        return {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          avatarUrl: user.avatar_url,
        };
      } catch (err) {
        logger.error({ err, userId: parent.userId }, 'Failed to get user');
        throw new Error('Failed to get user');
      }
    },
  },
};

// Create Apollo Server
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    ApolloServerPluginLandingPageLocalDefault({ embed: true }),
  ],
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
    
    // Basic middleware setup
    app.use(httpLogger);
    app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for GraphQL Playground
    app.use(compression());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
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
    
    // Start Apollo Server - MUST happen before mounting middleware
    await apolloServer.start();
    logger.info('Apollo Server started');
    
    // Mount Apollo Server middleware - IMPORTANT: before error handlers
    app.use(
      '/graphql',
      express.json(),
      cors<cors.CorsRequest>(corsOptions),
      expressMiddleware(apolloServer)
    );
    
    // Error handling middleware - AFTER Apollo middleware
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
      logger.info(`Profile service listening at http://${HOST}:${PORT}`);
    });
    
    logger.info('Profile service started successfully');
    
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
