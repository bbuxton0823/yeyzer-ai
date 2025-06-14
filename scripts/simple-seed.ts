#!/usr/bin/env ts-node
/**
 * Yeyzer AI Match-Assistant - Simple Database Seed Script
 * 
 * This script populates the database with basic mock data for development.
 * It creates:
 * - Users with hashed passwords
 * - Basic user profiles
 * - Simple ideal personas
 * 
 * Usage: ts-node simple-seed.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ------------------------ Types ------------------------ //
interface Location {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

// Initialize database connection
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/yeyzer';
const pool = new Pool({ connectionString: dbUrl });

// Constants
const MOCK_DATA_DIR = path.join(__dirname, '../mock-data');
const DEFAULT_PASSWORD = 'Password123!';
const SALT_ROUNDS = 10;

// Helper function to read JSON files
function readJsonFile<T>(filePath: string): T[] {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T[];
  } catch (error) {
    console.error(`Failed to read JSON file: ${filePath}`, error);
    return [];
  }
}

// Helper function to generate random array items
function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Helper to generate random skills
function generateRandomSkills(count: number = 5): string[] {
  const allSkills = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust',
    'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'CI/CD', 'GraphQL',
    'PostgreSQL', 'MongoDB', 'Redis', 'Machine Learning', 'AI', 'Data Science',
    'Product Management', 'UX Design', 'UI Design', 'DevOps', 'SRE',
    'Blockchain', 'Cybersecurity', 'Mobile Development', 'iOS', 'Android',
    'Leadership', 'Team Building', 'Strategic Planning', 'Growth Hacking',
    'SEO', 'Content Marketing', 'Sales', 'Business Development'
  ];
  return getRandomItems(allSkills, count);
}

// Helper to generate random interests
function generateRandomInterests(count: number = 3): string[] {
  const allInterests = [
    'Technology', 'Startups', 'Investing', 'Venture Capital', 'Entrepreneurship',
    'Open Source', 'AI Ethics', 'Remote Work', 'Digital Nomad', 'Sustainability',
    'Climate Tech', 'Health Tech', 'EdTech', 'FinTech', 'Blockchain',
    'Photography', 'Travel', 'Food', 'Fitness', 'Meditation',
    'Reading', 'Writing', 'Public Speaking', 'Mentoring', 'Volunteering'
  ];
  return getRandomItems(allInterests, count);
}

// Helper to generate random locations
function generateRandomLocation(): Location {
  const cities = [
    { city: 'San Francisco', state: 'CA', country: 'USA', lat: 37.7749, lng: -122.4194 },
    { city: 'Palo Alto', state: 'CA', country: 'USA', lat: 37.4419, lng: -122.1430 },
    { city: 'Mountain View', state: 'CA', country: 'USA', lat: 37.3861, lng: -122.0839 },
    { city: 'Menlo Park', state: 'CA', country: 'USA', lat: 37.4538, lng: -122.1822 },
    { city: 'Oakland', state: 'CA', country: 'USA', lat: 37.8044, lng: -122.2711 },
    { city: 'Berkeley', state: 'CA', country: 'USA', lat: 37.8715, lng: -122.2730 },
    { city: 'San Jose', state: 'CA', country: 'USA', lat: 37.3382, lng: -121.8863 },
    { city: 'Redwood City', state: 'CA', country: 'USA', lat: 37.4852, lng: -122.2364 }
  ];
  // The cities array is non-empty; the non-null assertion guarantees the return type
  return cities[Math.floor(Math.random() * cities.length)]!;
}

// Helper to generate random ideal persona
function generateIdealPersona() {
  const matchTypes = ['COMPLEMENT', 'MIRROR'];
  const experienceLevels = ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'EXECUTIVE', 'ANY'];
  const meetingPreferences = ['COFFEE', 'LUNCH', 'DINNER', 'DRINKS', 'VIRTUAL', 'ANY'];
  const meetingFrequencies = ['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'OPEN'];
  
  const professionalTraits = getRandomItems([
    'Creative', 'Analytical', 'Detail-oriented', 'Big-picture thinker',
    'Technical', 'Strategic', 'Innovative', 'Process-driven',
    'Leadership', 'Collaborative', 'Independent', 'Customer-focused'
  ], Math.floor(Math.random() * 4) + 2);
  
  const personalTraits = getRandomItems([
    'Outgoing', 'Reserved', 'Adventurous', 'Thoughtful',
    'Energetic', 'Calm', 'Organized', 'Spontaneous',
    'Curious', 'Focused', 'Adaptable', 'Persistent'
  ], Math.floor(Math.random() * 4) + 2);
  
  const industries = getRandomItems([
    'Technology', 'Healthcare', 'Finance', 'Education',
    'Retail', 'Manufacturing', 'Media', 'Entertainment',
    'Energy', 'Transportation', 'Real Estate', 'Hospitality'
  ], Math.floor(Math.random() * 3) + 1);
  
  return {
    matchType: matchTypes[Math.floor(Math.random() * matchTypes.length)],
    professionalTraits: JSON.stringify(professionalTraits),
    personalTraits: JSON.stringify(personalTraits),
    skillsDesired: JSON.stringify(generateRandomSkills(Math.floor(Math.random() * 5) + 3)),
    industryPreferences: JSON.stringify(industries),
    experienceLevelPreference: experienceLevels[Math.floor(Math.random() * experienceLevels.length)],
    meetingPreferences: JSON.stringify([meetingPreferences[Math.floor(Math.random() * meetingPreferences.length)]]),
    meetingFrequencyPreference: meetingFrequencies[Math.floor(Math.random() * meetingFrequencies.length)],
    description: `Looking to connect with professionals who can ${Math.random() > 0.5 ? 'complement' : 'mirror'} my skills and interests.`
  };
}

// Main seeding function
async function seedDatabase() {
  console.log('Starting database seed process...');
  
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Read mock data files
    const mockUsers = readJsonFile<any>(path.join(MOCK_DATA_DIR, 'users.json'));
    console.log(`Loaded ${mockUsers.length} mock users from JSON file.`);
    
    // Hash password once
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    
    // Create users and related data
    for (const mockUser of mockUsers) {
      // Check if user already exists
      const existingUserResult = await client.query(
        'SELECT id FROM yeyzer.users WHERE email = $1',
        [mockUser.email]
      );
      
      if (existingUserResult.rows.length > 0) {
        console.log(`User already exists: ${mockUser.email}, skipping.`);
        continue;
      }
      
      // Create user
      const userId = uuidv4();
      await client.query(
        `INSERT INTO yeyzer.users (
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
      console.log(`Created user: ${mockUser.firstName} ${mockUser.lastName} (${mockUser.email})`);
      
      // Create user profile
      const location: Location = generateRandomLocation();
      const skills = generateRandomSkills();
      const interests = generateRandomInterests();
      
      await client.query(
        `INSERT INTO yeyzer.user_profiles (
          user_id, headline, bio, city, state, country, latitude, longitude,
          profession, company, skills, interests, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [
          userId,
          `${mockUser.firstName} ${mockUser.lastName} | Professional at ${Math.random() > 0.5 ? 'Tech Company' : 'Startup'}`,
          `Professional with experience in ${skills.slice(0, 3).join(', ')}.`,
          location.city,
          location.state,
          location.country,
          location.lat,
          location.lng,
          Math.random() > 0.5 ? 'Software Engineer' : 'Product Manager',
          `${['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark Industries'][Math.floor(Math.random() * 5)]} Inc.`,
          JSON.stringify(skills),
          JSON.stringify(interests),
        ]
      );
      console.log(`Created profile for user: ${mockUser.email}`);
      
      // Create ideal persona
      const idealPersona = generateIdealPersona();
      await client.query(
        `INSERT INTO yeyzer.ideal_personas (
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
      console.log(`Created ideal persona for user: ${mockUser.email}`);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('Database seeded successfully!');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Failed to seed database:', error);
    throw error;
  } finally {
    // Release client back to pool
    client.release();
  }
}

// Run the seeding process
seedDatabase()
  .then(() => {
    console.log('Seed process completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  });
