#!/usr/bin/env ts-node
/**
 * Yeyzer AI Match-Assistant - Database Seed Script
 * 
 * This script populates the database with mock data for development and testing.
 * It reads from JSON files in the mock-data directory and creates:
 * - Users with hashed passwords
 * - User profiles with random persona data
 * - Social data (LinkedIn, GitHub, Twitter, Crunchbase)
 * - Random embeddings for matching
 * - Initial matches between users
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import faker from 'faker';
import { createPinoLogger, getEnv } from '@yeyzer/utils';

// Initialize logger
const logger = createPinoLogger('seed-script');

// Initialize database connection
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/yeyzer'),
});

// Constants
const MOCK_DATA_DIR = path.join(__dirname, '../mock-data');
const DEFAULT_PASSWORD = 'Password123!';
const VECTOR_DIMENSION = 384; // Standard dimension for embeddings
const NUM_MATCHES_PER_USER = 3; // Number of matches to create per user

// Helper function to read JSON files
function readJsonFile<T>(filePath: string): T[] {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T[];
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read JSON file');
    return [];
  }
}

// Helper function to generate random vector embeddings
function generateRandomEmbedding(dimension: number): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimension; i++) {
    vector.push((Math.random() * 2) - 1); // Values between -1 and 1
  }
  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / magnitude);
}

// Helper function to calculate cosine similarity between two vectors
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of the same dimension');
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  return dotProduct / (magnitudeA * magnitudeB);
}

// Helper function to generate random ideal persona data
function generateIdealPersona() {
  const professionalTraits = faker.helpers.uniqueArray(
    () => faker.company.bs(), 
    faker.datatype.number({ min: 3, max: 6 })
  );
  
  const personalTraits = faker.helpers.uniqueArray(
    () => faker.hacker.adjective(), 
    faker.datatype.number({ min: 3, max: 6 })
  );
  
  const skillsDesired = faker.helpers.uniqueArray(
    () => faker.hacker.verb(), 
    faker.datatype.number({ min: 4, max: 8 })
  );
  
  const industryPreferences = faker.helpers.uniqueArray(
    () => faker.company.bsNoun(), 
    faker.datatype.number({ min: 2, max: 4 })
  );
  
  const experienceLevelOptions = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'EXECUTIVE', 'ANY'];
  const experienceLevelPreference = experienceLevelOptions[Math.floor(Math.random() * experienceLevelOptions.length)];
  
  const meetingPreferenceOptions = ['COFFEE', 'LUNCH', 'DINNER', 'DRINKS', 'VIRTUAL', 'ANY'];
  const meetingPreferences = faker.helpers.uniqueArray(
    () => meetingPreferenceOptions[Math.floor(Math.random() * meetingPreferenceOptions.length)],
    faker.datatype.number({ min: 1, max: 3 })
  );
  
  const meetingFrequencyOptions = ['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'OPEN'];
  const meetingFrequencyPreference = meetingFrequencyOptions[Math.floor(Math.random() * meetingFrequencyOptions.length)];
  
  const matchTypeOptions = ['COMPLEMENT', 'MIRROR'];
  const matchType = matchTypeOptions[Math.floor(Math.random() * matchTypeOptions.length)];
  
  return {
    matchType,
    professionalTraits: JSON.stringify(professionalTraits),
    personalTraits: JSON.stringify(personalTraits),
    skillsDesired: JSON.stringify(skillsDesired),
    industryPreferences: JSON.stringify(industryPreferences),
    experienceLevelPreference,
    meetingPreferences: JSON.stringify(meetingPreferences),
    meetingFrequencyPreference,
    description: faker.lorem.paragraph(2),
  };
}

// Helper function to generate GitHub data
function generateGitHubData(userId: string) {
  const username = faker.internet.userName();
  
  const topRepositories = Array.from({ length: faker.datatype.number({ min: 3, max: 8 }) }, () => ({
    name: faker.hacker.noun() + '-' + faker.hacker.verb(),
    description: faker.hacker.phrase(),
    url: `https://github.com/${username}/${faker.hacker.noun()}-${faker.hacker.verb()}`,
    stars: faker.datatype.number({ min: 0, max: 1000 }),
    forks: faker.datatype.number({ min: 0, max: 300 }),
    language: faker.helpers.arrayElement(['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'PHP']),
  }));
  
  const topLanguages = faker.helpers.uniqueArray(
    () => faker.helpers.arrayElement(['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'PHP', 'HTML', 'CSS', 'Ruby']),
    faker.datatype.number({ min: 3, max: 6 })
  );
  
  return {
    userId,
    githubUsername: username,
    profileUrl: `https://github.com/${username}`,
    bio: faker.lorem.sentence(),
    company: faker.company.companyName(),
    location: `${faker.address.city()}, ${faker.address.country()}`,
    blog: faker.internet.url(),
    publicRepos: faker.datatype.number({ min: 5, max: 50 }),
    followers: faker.datatype.number({ min: 0, max: 2000 }),
    following: faker.datatype.number({ min: 0, max: 500 }),
    topRepositories: JSON.stringify(topRepositories),
    topLanguages: JSON.stringify(topLanguages),
    contributionCount: faker.datatype.number({ min: 50, max: 3000 }),
    lastUpdated: new Date().toISOString(),
  };
}

// Helper function to generate Twitter data
function generateTwitterData(userId: string) {
  const username = faker.internet.userName();
  
  const recentTweets = Array.from({ length: faker.datatype.number({ min: 10, max: 20 }) }, () => ({
    id: faker.datatype.uuid(),
    text: faker.lorem.sentence(),
    createdAt: faker.date.recent(30).toISOString(),
    likeCount: faker.datatype.number({ min: 0, max: 500 }),
    retweetCount: faker.datatype.number({ min: 0, max: 100 }),
    replyCount: faker.datatype.number({ min: 0, max: 50 }),
  }));
  
  return {
    userId,
    twitterUsername: username,
    profileUrl: `https://twitter.com/${username}`,
    displayName: `${faker.name.firstName()} ${faker.name.lastName()}`,
    bio: faker.lorem.sentence(),
    location: `${faker.address.city()}, ${faker.address.country()}`,
    followersCount: faker.datatype.number({ min: 0, max: 10000 }),
    followingCount: faker.datatype.number({ min: 0, max: 2000 }),
    tweetCount: faker.datatype.number({ min: 100, max: 5000 }),
    recentTweets: JSON.stringify(recentTweets),
    lastUpdated: new Date().toISOString(),
  };
}

// Helper function to generate Crunchbase data
function generateCrunchbaseData(userId: string) {
  const companyName = faker.company.companyName();
  const role = faker.name.jobTitle();
  
  const companyDetails = {
    description: faker.company.catchPhrase(),
    foundedDate: faker.date.past(10).toISOString().split('T')[0],
    industry: faker.helpers.uniqueArray(faker.commerce.department, faker.datatype.number({ min: 1, max: 3 })),
    companySize: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+']),
    headquarters: `${faker.address.city()}, ${faker.address.country()}`,
    website: `https://${companyName.toLowerCase().replace(/\s/g, '')}.com`,
  };
  
  const funding = Array.from({ length: faker.datatype.number({ min: 0, max: 5 }) }, () => ({
    round: faker.helpers.arrayElement(['Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Growth', 'Private Equity']),
    amount: faker.datatype.number({ min: 100000, max: 100000000 }),
    date: faker.date.past(5).toISOString(),
    investors: faker.helpers.uniqueArray(faker.company.companyName, faker.datatype.number({ min: 1, max: 5 })),
  }));
  
  return {
    userId,
    crunchbaseProfileUrl: `https://www.crunchbase.com/person/${faker.internet.userName()}`,
    companyName,
    role,
    companyDetails: JSON.stringify(companyDetails),
    funding: JSON.stringify(funding),
    lastUpdated: new Date().toISOString(),
  };
}

// Main seeding function
async function seedDatabase() {
  logger.info('Starting database seed process');
  
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Read mock data files
    const mockUsers = readJsonFile<any>(path.join(MOCK_DATA_DIR, 'users.json'));
    const mockLinkedInData = readJsonFile<any>(path.join(MOCK_DATA_DIR, 'linkedin.json'));
    
    // Hash password once
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    
    logger.info({ count: mockUsers.length }, 'Seeding users');
    
    // Create users and related data
    const createdUsers: { id: string, email: string }[] = [];
    const userVectors: { userId: string, vector: number[] }[] = [];
    
    for (const mockUser of mockUsers) {
      // Check if user already exists
      const existingUserResult = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [mockUser.email]
      );
      
      if (existingUserResult.rows.length > 0) {
        logger.info({ email: mockUser.email }, 'User already exists, skipping');
        createdUsers.push({ id: existingUserResult.rows[0].id, email: mockUser.email });
        continue;
      }
      
      // Create user
      const userId = uuidv4();
      await client.query(
        `INSERT INTO users (
          id, email, password, first_name, last_name, avatar_url, is_active, is_verified, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          userId,
          mockUser.email,
          hashedPassword,
          mockUser.firstName,
          mockUser.lastName,
          mockUser.avatarUrl || `https://ui-avatars.com/api/?name=${mockUser.firstName}+${mockUser.lastName}`,
          true,
          true,
        ]
      );
      
      createdUsers.push({ id: userId, email: mockUser.email });
      
      // Create user profile
      const city = faker.address.city();
      const state = faker.address.state();
      const country = faker.address.country();
      const latitude = parseFloat(faker.address.latitude());
      const longitude = parseFloat(faker.address.longitude());
      
      const skills = faker.helpers.uniqueArray(
        () => faker.hacker.verb(), 
        faker.datatype.number({ min: 5, max: 10 })
      );
      
      const interests = faker.helpers.uniqueArray(
        () => faker.hacker.noun(), 
        faker.datatype.number({ min: 3, max: 8 })
      );
      
      await client.query(
        `INSERT INTO user_profiles (
          user_id, headline, bio, city, state, country, latitude, longitude,
          profession, company, skills, interests, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [
          userId,
          faker.name.jobTitle(),
          faker.lorem.paragraph(),
          city,
          state,
          country,
          latitude,
          longitude,
          faker.name.jobType(),
          faker.company.companyName(),
          JSON.stringify(skills),
          JSON.stringify(interests),
        ]
      );
      
      // Update PostGIS point
      await client.query(
        `UPDATE user_profiles SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE user_id = $3`,
        [longitude, latitude, userId]
      );
      
      // Create ideal persona
      const idealPersona = generateIdealPersona();
      await client.query(
        `INSERT INTO ideal_personas (
          user_id, match_type, professional_traits, personal_traits, skills_desired,
          industry_preferences, experience_level_preference, meeting_preferences,
          meeting_frequency_preference, description, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [
          userId,
          idealPersona.matchType,
          idealPersona.professionalTraits,
          idealPersona.personalTraits,
          idealPersona.skillsDesired,
          idealPersona.industryPreferences,
          idealPersona.experienceLevelPreference,
          idealPersona.meetingPreferences,
          idealPersona.meetingFrequencyPreference,
          idealPersona.description,
        ]
      );
      
      // Find LinkedIn data for this user
      const linkedInData = mockLinkedInData.find((data: any) => data.email === mockUser.email);
      
      if (linkedInData) {
        // Insert LinkedIn data
        await client.query(
          `INSERT INTO linkedin_data (
            user_id, linkedin_id, profile_url, headline, summary, industry,
            skills, positions, educations, last_updated, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            userId,
            linkedInData.linkedInId,
            linkedInData.profileUrl,
            linkedInData.headline,
            linkedInData.summary,
            linkedInData.industry,
            JSON.stringify(linkedInData.skills),
            JSON.stringify(linkedInData.positions),
            JSON.stringify(linkedInData.educations),
            linkedInData.lastUpdated || new Date().toISOString(),
          ]
        );
      } else {
        // Create mock LinkedIn data
        const mockLinkedIn = {
          linkedInId: faker.random.alphaNumeric(10),
          profileUrl: `https://www.linkedin.com/in/${mockUser.firstName.toLowerCase()}${mockUser.lastName.toLowerCase()}${faker.datatype.number(999)}/`,
          headline: faker.name.jobTitle(),
          summary: faker.lorem.paragraph(),
          industry: faker.name.jobArea(),
          skills: faker.helpers.uniqueArray(faker.hacker.verb, faker.datatype.number({ min: 5, max: 15 })),
          positions: Array.from({ length: faker.datatype.number({ min: 1, max: 4 }) }, () => ({
            title: faker.name.jobTitle(),
            company: faker.company.companyName(),
            startDate: faker.date.past(5).toISOString().split('T')[0],
            endDate: Math.random() > 0.3 ? faker.date.past(2).toISOString().split('T')[0] : null,
            current: Math.random() > 0.3,
            description: faker.lorem.paragraph(),
          })),
          educations: Array.from({ length: faker.datatype.number({ min: 1, max: 3 }) }, () => ({
            school: faker.company.companyName() + ' University',
            degree: faker.helpers.arrayElement(['B.S.', 'M.S.', 'Ph.D.', 'MBA', 'B.A.']),
            fieldOfStudy: faker.name.jobArea(),
            startDate: faker.date.past(10).getFullYear().toString(),
            endDate: faker.date.past(5).getFullYear().toString(),
          })),
        };
        
        await client.query(
          `INSERT INTO linkedin_data (
            user_id, linkedin_id, profile_url, headline, summary, industry,
            skills, positions, educations, last_updated, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            userId,
            mockLinkedIn.linkedInId,
            mockLinkedIn.profileUrl,
            mockLinkedIn.headline,
            mockLinkedIn.summary,
            mockLinkedIn.industry,
            JSON.stringify(mockLinkedIn.skills),
            JSON.stringify(mockLinkedIn.positions),
            JSON.stringify(mockLinkedIn.educations),
            new Date().toISOString(),
          ]
        );
      }
      
      // Create GitHub data
      const githubData = generateGitHubData(userId);
      await client.query(
        `INSERT INTO github_data (
          user_id, github_username, profile_url, bio, company, location,
          blog, public_repos, followers, following, top_repositories,
          top_languages, contribution_count, last_updated, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
        [
          userId,
          githubData.githubUsername,
          githubData.profileUrl,
          githubData.bio,
          githubData.company,
          githubData.location,
          githubData.blog,
          githubData.publicRepos,
          githubData.followers,
          githubData.following,
          githubData.topRepositories,
          githubData.topLanguages,
          githubData.contributionCount,
          githubData.lastUpdated,
        ]
      );
      
      // Create Twitter data
      const twitterData = generateTwitterData(userId);
      await client.query(
        `INSERT INTO twitter_data (
          user_id, twitter_username, profile_url, display_name, bio,
          location, followers_count, following_count, tweet_count,
          recent_tweets, last_updated, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [
          userId,
          twitterData.twitterUsername,
          twitterData.profileUrl,
          twitterData.displayName,
          twitterData.bio,
          twitterData.location,
          twitterData.followersCount,
          twitterData.followingCount,
          twitterData.tweetCount,
          twitterData.recentTweets,
          twitterData.lastUpdated,
        ]
      );
      
      // Create Crunchbase data
      const crunchbaseData = generateCrunchbaseData(userId);
      await client.query(
        `INSERT INTO crunchbase_data (
          user_id, crunchbase_profile_url, company_name, role,
          company_details, funding, last_updated, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          userId,
          crunchbaseData.crunchbaseProfileUrl,
          crunchbaseData.companyName,
          crunchbaseData.role,
          crunchbaseData.companyDetails,
          crunchbaseData.funding,
          crunchbaseData.lastUpdated,
        ]
      );
      
      // Generate random embeddings for matching
      const professionalVector = generateRandomEmbedding(VECTOR_DIMENSION);
      const personalVector = generateRandomEmbedding(VECTOR_DIMENSION);
      const skillsVector = generateRandomEmbedding(VECTOR_DIMENSION);
      const industryVector = generateRandomEmbedding(VECTOR_DIMENSION);
      
      // Store vectors for later match creation
      userVectors.push({ userId, vector: professionalVector });
      
      // Insert vectors into database
      await client.query(
        `INSERT INTO match_vectors (
          user_id, professional_vector, personal_vector, skills_vector,
          industry_vector, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          userId,
          professionalVector,
          personalVector,
          skillsVector,
          industryVector,
        ]
      );
    }
    
    logger.info({ count: createdUsers.length }, 'Users created successfully');
    
    // Create matches between users
    logger.info('Creating matches between users');
    
    for (const user of createdUsers) {
      const userVector = userVectors.find(uv => uv.userId === user.id)?.vector;
      if (!userVector) continue;
      
      // Calculate similarity scores with all other users
      const similarities = userVectors
        .filter(uv => uv.userId !== user.id)
        .map(otherUser => ({
          userId: user.id,
          matchedUserId: otherUser.userId,
          score: calculateCosineSimilarity(userVector, otherUser.vector),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, NUM_MATCHES_PER_USER);
      
      // Create matches
      for (const match of similarities) {
        // Check if match already exists
        const existingMatchResult = await client.query(
          'SELECT id FROM matches WHERE (user_id = $1 AND matched_user_id = $2) OR (user_id = $2 AND matched_user_id = $1)',
          [match.userId, match.matchedUserId]
        );
        
        if (existingMatchResult.rows.length > 0) {
          logger.info({ userId: match.userId, matchedUserId: match.matchedUserId }, 'Match already exists, skipping');
          continue;
        }
        
        const matchId = uuidv4();
        const scoreOverall = match.score;
        const scoreProfessionalFit = Math.min(1, Math.max(0, scoreOverall * (0.8 + Math.random() * 0.4)));
        const scorePersonalFit = Math.min(1, Math.max(0, scoreOverall * (0.8 + Math.random() * 0.4)));
        const scoreSkillsAlignment = Math.min(1, Math.max(0, scoreOverall * (0.8 + Math.random() * 0.4)));
        const scoreIndustryAlignment = Math.min(1, Math.max(0, scoreOverall * (0.8 + Math.random() * 0.4)));
        const scoreExperienceCompatibility = Math.min(1, Math.max(0, scoreOverall * (0.8 + Math.random() * 0.4)));
        
        const scoreDetails = {
          communication: Math.random().toFixed(2),
          innovation: Math.random().toFixed(2),
          leadership: Math.random().toFixed(2),
          technicalSkills: Math.random().toFixed(2),
        };
        
        await client.query(
          `INSERT INTO matches (
            id, user_id, matched_user_id, status, score_overall,
            score_professional_fit, score_personal_fit, score_skills_alignment,
            score_industry_alignment, score_experience_compatibility,
            score_details, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [
            matchId,
            match.userId,
            match.matchedUserId,
            'PENDING',
            scoreOverall,
            scoreProfessionalFit,
            scorePersonalFit,
            scoreSkillsAlignment,
            scoreIndustryAlignment,
            scoreExperienceCompatibility,
            JSON.stringify(scoreDetails),
          ]
        );
        
        // Create icebreaker for the match
        const icebreakerId = uuidv4();
        const icebreakers = [
          "I noticed you've worked with AI technologies. What's the most interesting project you've tackled recently?",
          "Your background in finance and my experience in tech could make for some interesting conversations. What's your take on the future of fintech?",
          "I see we both have experience at startups. What's been your biggest learning from that environment?",
          "Your work in healthcare innovation sounds fascinating. What inspired you to focus on that field?",
          "We seem to share an interest in sustainable technology. Have you worked on any projects in that space?",
          "I'd love to hear about your experience transitioning from corporate to startup. What was the biggest adjustment?",
          "Your LinkedIn profile mentions design thinking. How do you apply that methodology in your current role?",
          "I see we both attended conferences in the AI space last year. Did you have any favorite presentations?",
          "Your work combining data science and healthcare is exactly what I've been interested in exploring. Would you be open to sharing your insights?",
          "We have complementary skill sets in product and engineering. I'd be curious to hear your perspective on how those teams can collaborate more effectively."
        ];
        
        const icebreaker = icebreakers[Math.floor(Math.random() * icebreakers.length)];
        
        await client.query(
          `INSERT INTO icebreakers (
            id, match_id, text, generated_by, accepted, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            icebreakerId,
            matchId,
            icebreaker,
            'SYSTEM',
            false,
          ]
        );
        
        // Update match with icebreaker ID
        await client.query(
          `UPDATE matches SET icebreaker_id = $1 WHERE id = $2`,
          [icebreakerId, matchId]
        );
        
        // Create venue recommendations for some matches (30% chance)
        if (Math.random() < 0.3) {
          // Get user locations
          const userLocationResult = await client.query(
            'SELECT latitude, longitude FROM user_profiles WHERE user_id = $1',
            [match.userId]
          );
          
          const matchedUserLocationResult = await client.query(
            'SELECT latitude, longitude FROM user_profiles WHERE user_id = $1',
            [match.matchedUserId]
          );
          
          if (userLocationResult.rows.length > 0 && matchedUserLocationResult.rows.length > 0) {
            const userLat = userLocationResult.rows[0].latitude;
            const userLon = userLocationResult.rows[0].longitude;
            const matchedUserLat = matchedUserLocationResult.rows[0].latitude;
            const matchedUserLon = matchedUserLocationResult.rows[0].longitude;
            
            // Calculate midpoint (simple average for demo)
            const midpointLat = (userLat + matchedUserLat) / 2;
            const midpointLon = (userLon + matchedUserLon) / 2;
            
            // Create 3 venue recommendations
            const venueTypes = ['CAFE', 'RESTAURANT', 'BAR', 'COWORKING', 'PARK'];
            
            for (let i = 0; i < 3; i++) {
              const venueId = uuidv4();
              const venueName = faker.company.companyName() + ' ' + faker.helpers.arrayElement(['Cafe', 'Restaurant', 'Bar', 'Hub', 'Space']);
              const venueAddress = faker.address.streetAddress() + ', ' + faker.address.city();
              
              // Slightly adjust location from midpoint
              const venueLat = midpointLat + (Math.random() - 0.5) * 0.01;
              const venueLon = midpointLon + (Math.random() - 0.5) * 0.01;
              
              const venueType = venueTypes[Math.floor(Math.random() * venueTypes.length)];
              const priceLevel = Math.floor(Math.random() * 4) + 1;
              
              // Create venue
              await client.query(
                `INSERT INTO venues (
                  id, google_place_id, name, address, latitude, longitude,
                  phone, website, rating, user_ratings_count, price_level,
                  types, photos, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
                [
                  venueId,
                  'place_id_' + faker.random.alphaNumeric(16),
                  venueName,
                  venueAddress,
                  venueLat,
                  venueLon,
                  faker.phone.phoneNumber(),
                  faker.internet.url(),
                  (Math.random() * 3 + 2).toFixed(1),
                  faker.datatype.number({ min: 10, max: 1000 }),
                  priceLevel.toString(),
                  JSON.stringify([venueType.toLowerCase()]),
                  JSON.stringify([]),
                ]
              );
              
              // Update venue location point
              await client.query(
                `UPDATE venues SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
                [venueLon, venueLat, venueId]
              );
              
              // Create venue recommendation
              const recommendationId = uuidv4();
              const distanceFromMidpoint = Math.sqrt(
                Math.pow(venueLat - midpointLat, 2) + Math.pow(venueLon - midpointLon, 2)
              ) * 111.32; // Rough conversion to km
              
              await client.query(
                `INSERT INTO venue_recommendations (
                  id, match_id, venue_id, reason, distance_from_midpoint,
                  selected, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                [
                  recommendationId,
                  matchId,
                  venueId,
                  faker.lorem.sentence(),
                  distanceFromMidpoint,
                  false,
                ]
              );
            }
          }
        }
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    logger.info('Database seeded successfully');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error({ error }, 'Failed to seed database');
    throw error;
  } finally {
    // Release client back to pool
    client.release();
  }
}

// Run the seeding process
seedDatabase()
  .then(() => {
    logger.info('Seed process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Seed process failed');
    process.exit(1);
  });
