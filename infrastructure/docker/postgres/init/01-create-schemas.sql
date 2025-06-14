-- Yeyzer AI Match-Assistant - Database Schema
-- This file creates all tables, indexes, constraints, and triggers for the Yeyzer application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Set timezone
SET timezone = 'UTC';

-- Create schema
CREATE SCHEMA IF NOT EXISTS yeyzer;
SET search_path TO yeyzer, public;

-- ===============================
-- USERS AND AUTHENTICATION
-- ===============================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    linkedin_id VARCHAR(255) UNIQUE,
    github_id VARCHAR(255) UNIQUE,
    twitter_id VARCHAR(255) UNIQUE,
    crunchbase_id VARCHAR(255) UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token UUID,
    verification_expires_at TIMESTAMP WITH TIME ZONE,
    reset_password_token UUID,
    reset_password_expires_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- OAuth tokens table
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider)
);

-- ===============================
-- USER PROFILES AND PERSONAS
-- ===============================

-- User profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    headline VARCHAR(160),
    bio TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    profession VARCHAR(100),
    company VARCHAR(100),
    skills JSONB DEFAULT '[]'::JSONB,
    interests JSONB DEFAULT '[]'::JSONB,
    education JSONB DEFAULT '[]'::JSONB,
    experience JSONB DEFAULT '[]'::JSONB,
    privacy_settings JSONB DEFAULT '{"showLinkedIn": true, "showGitHub": true, "showTwitter": true, "showCrunchbase": true}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add PostGIS point for location
SELECT AddGeometryColumn('user_profiles', 'location', 4326, 'POINT', 2);
CREATE INDEX user_profiles_location_idx ON user_profiles USING GIST(location);

-- Ideal personas table
CREATE TABLE ideal_personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    match_type VARCHAR(20) NOT NULL DEFAULT 'COMPLEMENT' CHECK (match_type IN ('COMPLEMENT', 'MIRROR')),
    professional_traits JSONB DEFAULT '[]'::JSONB,
    personal_traits JSONB DEFAULT '[]'::JSONB,
    skills_desired JSONB DEFAULT '[]'::JSONB,
    industry_preferences JSONB DEFAULT '[]'::JSONB,
    experience_level_preference VARCHAR(20) NOT NULL DEFAULT 'ANY' CHECK (experience_level_preference IN ('ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'EXECUTIVE', 'ANY')),
    meeting_preferences JSONB DEFAULT '["ANY"]'::JSONB,
    meeting_frequency_preference VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (meeting_frequency_preference IN ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'OPEN')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===============================
-- SOCIAL DATA
-- ===============================

-- LinkedIn data table
CREATE TABLE linkedin_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    linkedin_id VARCHAR(255) NOT NULL,
    profile_url TEXT NOT NULL,
    headline TEXT,
    summary TEXT,
    industry VARCHAR(100),
    skills JSONB DEFAULT '[]'::JSONB,
    positions JSONB DEFAULT '[]'::JSONB,
    educations JSONB DEFAULT '[]'::JSONB,
    raw_data JSONB,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- GitHub data table
CREATE TABLE github_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    github_username VARCHAR(255) NOT NULL,
    profile_url TEXT NOT NULL,
    bio TEXT,
    company VARCHAR(255),
    location VARCHAR(255),
    blog TEXT,
    public_repos INTEGER NOT NULL DEFAULT 0,
    followers INTEGER NOT NULL DEFAULT 0,
    following INTEGER NOT NULL DEFAULT 0,
    top_repositories JSONB DEFAULT '[]'::JSONB,
    top_languages JSONB DEFAULT '[]'::JSONB,
    contribution_count INTEGER NOT NULL DEFAULT 0,
    raw_data JSONB,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Twitter data table
CREATE TABLE twitter_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    twitter_username VARCHAR(255) NOT NULL,
    profile_url TEXT NOT NULL,
    display_name VARCHAR(255),
    bio TEXT,
    location VARCHAR(255),
    followers_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    tweet_count INTEGER NOT NULL DEFAULT 0,
    recent_tweets JSONB DEFAULT '[]'::JSONB,
    raw_data JSONB,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Crunchbase data table
CREATE TABLE crunchbase_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    crunchbase_profile_url TEXT,
    company_name VARCHAR(255),
    role VARCHAR(255),
    company_details JSONB,
    funding JSONB DEFAULT '[]'::JSONB,
    raw_data JSONB,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===============================
-- MATCH AND SCORING
-- ===============================

-- Match status enum
CREATE TYPE match_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- Matches table
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    matched_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status match_status NOT NULL DEFAULT 'PENDING',
    score_overall NUMERIC(4,3) NOT NULL CHECK (score_overall >= 0 AND score_overall <= 1),
    score_professional_fit NUMERIC(4,3) NOT NULL CHECK (score_professional_fit >= 0 AND score_professional_fit <= 1),
    score_personal_fit NUMERIC(4,3) NOT NULL CHECK (score_personal_fit >= 0 AND score_personal_fit <= 1),
    score_skills_alignment NUMERIC(4,3) NOT NULL CHECK (score_skills_alignment >= 0 AND score_skills_alignment <= 1),
    score_industry_alignment NUMERIC(4,3) NOT NULL CHECK (score_industry_alignment >= 0 AND score_industry_alignment <= 1),
    score_experience_compatibility NUMERIC(4,3) NOT NULL CHECK (score_experience_compatibility >= 0 AND score_experience_compatibility <= 1),
    score_details JSONB,
    scheduled_time TIMESTAMP WITH TIME ZONE,
    user_feedback INTEGER CHECK (user_feedback >= 1 AND user_feedback <= 5),
    matched_user_feedback INTEGER CHECK (matched_user_feedback >= 1 AND matched_user_feedback <= 5),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT different_users CHECK (user_id <> matched_user_id),
    UNIQUE (user_id, matched_user_id)
);

-- Create index for match queries
CREATE INDEX matches_user_id_status_idx ON matches(user_id, status);
CREATE INDEX matches_matched_user_id_status_idx ON matches(matched_user_id, status);
CREATE INDEX matches_score_overall_idx ON matches(score_overall DESC);

-- Match vectors table (for embedding similarity)
CREATE TABLE match_vectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    professional_vector VECTOR(384),
    personal_vector VECTOR(384),
    skills_vector VECTOR(384),
    industry_vector VECTOR(384),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===============================
-- CONVERSATION AND MESSAGING
-- ===============================

-- Icebreakers table
CREATE TABLE icebreakers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    generated_by VARCHAR(10) NOT NULL DEFAULT 'SYSTEM' CHECK (generated_by IN ('SYSTEM', 'USER')),
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Chats table
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT different_chat_users CHECK (user1_id <> user2_id)
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT different_message_users CHECK (sender_id <> receiver_id)
);

-- Create indexes for message queries
CREATE INDEX messages_chat_id_idx ON messages(chat_id);
CREATE INDEX messages_sender_id_idx ON messages(sender_id);
CREATE INDEX messages_receiver_id_idx ON messages(receiver_id);
CREATE INDEX messages_created_at_idx ON messages(created_at DESC);

-- ===============================
-- VENUES
-- ===============================

-- Venues table
CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_place_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    phone VARCHAR(50),
    website TEXT,
    rating NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 5),
    user_ratings_count INTEGER,
    price_level VARCHAR(1) CHECK (price_level IN ('1', '2', '3', '4')),
    types JSONB DEFAULT '[]'::JSONB,
    photos JSONB DEFAULT '[]'::JSONB,
    opening_hours JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add PostGIS point for location
SELECT AddGeometryColumn('venues', 'location', 4326, 'POINT', 2);
CREATE INDEX venues_location_idx ON venues USING GIST(location);

-- Venue recommendations table
CREATE TABLE venue_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    reason TEXT,
    distance_from_midpoint NUMERIC(10,2),
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, venue_id)
);

-- ===============================
-- VOICE INTERFACE
-- ===============================

-- Voice command types enum
CREATE TYPE voice_command_type AS ENUM ('WAKE', 'MATCH', 'CHAT', 'VENUE', 'SCHEDULE', 'HELP', 'CANCEL', 'UNKNOWN');

-- Voice sessions table
CREATE TABLE voice_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Voice commands table
CREATE TABLE voice_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    audio_url TEXT,
    transcription TEXT NOT NULL,
    command_type voice_command_type NOT NULL,
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for voice command queries
CREATE INDEX voice_commands_session_id_idx ON voice_commands(session_id);
CREATE INDEX voice_commands_user_id_idx ON voice_commands(user_id);
CREATE INDEX voice_commands_processed_at_idx ON voice_commands(processed_at DESC);

-- ===============================
-- SAFETY AND REPORTING
-- ===============================

-- Safety report reason enum
CREATE TYPE safety_report_reason AS ENUM (
    'INAPPROPRIATE_CONTENT',
    'HARASSMENT',
    'SPAM',
    'FAKE_PROFILE',
    'OTHER'
);

-- Safety report status enum
CREATE TYPE safety_report_status AS ENUM (
    'PENDING',
    'INVESTIGATING',
    'RESOLVED',
    'DISMISSED'
);

-- Safety reports table
CREATE TABLE safety_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    reason safety_report_reason NOT NULL,
    details TEXT,
    status safety_report_status NOT NULL DEFAULT 'PENDING',
    admin_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT different_report_users CHECK (reporter_id <> reported_user_id)
);

-- Check-in status enum
CREATE TYPE check_in_status AS ENUM ('PENDING', 'COMPLETED', 'MISSED');

-- Check-in response enum
CREATE TYPE check_in_response AS ENUM ('SAFE', 'UNSAFE', 'NO_RESPONSE');

-- Check-ins table
CREATE TABLE check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE,
    status check_in_status NOT NULL DEFAULT 'PENDING',
    response check_in_response,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===============================
-- TRIGGERS
-- ===============================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables to update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ideal_personas_updated_at BEFORE UPDATE ON ideal_personas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_linkedin_data_updated_at BEFORE UPDATE ON linkedin_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_github_data_updated_at BEFORE UPDATE ON github_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_twitter_data_updated_at BEFORE UPDATE ON twitter_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crunchbase_data_updated_at BEFORE UPDATE ON crunchbase_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_vectors_updated_at BEFORE UPDATE ON match_vectors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_icebreakers_updated_at BEFORE UPDATE ON icebreakers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venue_recommendations_updated_at BEFORE UPDATE ON venue_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_sessions_updated_at BEFORE UPDATE ON voice_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_voice_commands_updated_at BEFORE UPDATE ON voice_commands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_safety_reports_updated_at BEFORE UPDATE ON safety_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_check_ins_updated_at BEFORE UPDATE ON check_ins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_message_at in chats when a new message is inserted
CREATE OR REPLACE FUNCTION update_chat_last_message_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chats
    SET last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_message_at
CREATE TRIGGER update_chat_last_message_timestamp_trigger
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_last_message_timestamp();

-- Function to automatically create user_profile and ideal_persona records when a new user is created
CREATE OR REPLACE FUNCTION create_user_related_records()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user profile
    INSERT INTO user_profiles (user_id)
    VALUES (NEW.id);
    
    -- Create ideal persona
    INSERT INTO ideal_personas (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to create related records
CREATE TRIGGER create_user_related_records_trigger
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_user_related_records();

-- Function to update location point when latitude/longitude are updated
CREATE OR REPLACE FUNCTION update_location_point()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update location points
CREATE TRIGGER update_user_profile_location_point
BEFORE INSERT OR UPDATE OF latitude, longitude ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_location_point();

CREATE TRIGGER update_venue_location_point
BEFORE INSERT OR UPDATE OF latitude, longitude ON venues
FOR EACH ROW
EXECUTE FUNCTION update_location_point();

-- Function to automatically create a chat when a match is accepted
CREATE OR REPLACE FUNCTION create_chat_for_accepted_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ACCEPTED' AND OLD.status != 'ACCEPTED' THEN
        INSERT INTO chats (match_id, user1_id, user2_id)
        VALUES (NEW.id, NEW.user_id, NEW.matched_user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to create chat when match is accepted
CREATE TRIGGER create_chat_for_accepted_match_trigger
AFTER UPDATE OF status ON matches
FOR EACH ROW
EXECUTE FUNCTION create_chat_for_accepted_match();

-- Function to schedule check-in when a match is scheduled
CREATE OR REPLACE FUNCTION schedule_check_in_for_scheduled_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'SCHEDULED' AND NEW.scheduled_time IS NOT NULL AND 
       (OLD.status != 'SCHEDULED' OR OLD.scheduled_time IS NULL OR OLD.scheduled_time != NEW.scheduled_time) THEN
        -- Schedule check-in for both users
        INSERT INTO check_ins (user_id, match_id, scheduled_time)
        VALUES (NEW.user_id, NEW.id, NEW.scheduled_time + interval '2 hours');
        
        INSERT INTO check_ins (user_id, match_id, scheduled_time)
        VALUES (NEW.matched_user_id, NEW.id, NEW.scheduled_time + interval '2 hours');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to schedule check-ins when match is scheduled
CREATE TRIGGER schedule_check_in_for_scheduled_match_trigger
AFTER UPDATE OF status, scheduled_time ON matches
FOR EACH ROW
EXECUTE FUNCTION schedule_check_in_for_scheduled_match();

-- ===============================
-- INDEXES
-- ===============================

-- Users indexes
CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_is_active_idx ON users(is_active);
CREATE INDEX users_role_idx ON users(role);
CREATE INDEX users_created_at_idx ON users(created_at);
CREATE INDEX users_last_login_at_idx ON users(last_login_at);

-- Sessions indexes
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX sessions_is_valid_idx ON sessions(is_valid);

-- OAuth tokens indexes
CREATE INDEX oauth_tokens_user_id_provider_idx ON oauth_tokens(user_id, provider);
CREATE INDEX oauth_tokens_expires_at_idx ON oauth_tokens(expires_at);

-- User profiles indexes
CREATE INDEX user_profiles_user_id_idx ON user_profiles(user_id);
CREATE INDEX user_profiles_profession_idx ON user_profiles(profession);
CREATE INDEX user_profiles_company_idx ON user_profiles(company);
CREATE INDEX user_profiles_skills_gin_idx ON user_profiles USING GIN(skills);
CREATE INDEX user_profiles_interests_gin_idx ON user_profiles USING GIN(interests);

-- Ideal personas indexes
CREATE INDEX ideal_personas_user_id_idx ON ideal_personas(user_id);
CREATE INDEX ideal_personas_match_type_idx ON ideal_personas(match_type);
CREATE INDEX ideal_personas_professional_traits_gin_idx ON ideal_personas USING GIN(professional_traits);
CREATE INDEX ideal_personas_skills_desired_gin_idx ON ideal_personas USING GIN(skills_desired);
CREATE INDEX ideal_personas_industry_preferences_gin_idx ON ideal_personas USING GIN(industry_preferences);

-- Social data indexes
CREATE INDEX linkedin_data_user_id_idx ON linkedin_data(user_id);
CREATE INDEX linkedin_data_skills_gin_idx ON linkedin_data USING GIN(skills);
CREATE INDEX github_data_user_id_idx ON github_data(user_id);
CREATE INDEX github_data_top_languages_gin_idx ON github_data USING GIN(top_languages);
CREATE INDEX twitter_data_user_id_idx ON twitter_data(user_id);
CREATE INDEX crunchbase_data_user_id_idx ON crunchbase_data(user_id);

-- Venue indexes
CREATE INDEX venues_google_place_id_idx ON venues(google_place_id);
CREATE INDEX venues_name_idx ON venues(name);
CREATE INDEX venues_price_level_idx ON venues(price_level);
CREATE INDEX venues_rating_idx ON venues(rating DESC);
CREATE INDEX venues_types_gin_idx ON venues USING GIN(types);

-- Full text search indexes
CREATE INDEX users_name_trgm_idx ON users USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX user_profiles_headline_trgm_idx ON user_profiles USING GIN (headline gin_trgm_ops);
CREATE INDEX user_profiles_bio_trgm_idx ON user_profiles USING GIN (bio gin_trgm_ops);
CREATE INDEX venues_name_trgm_idx ON venues USING GIN (name gin_trgm_ops);
CREATE INDEX venues_address_trgm_idx ON venues USING GIN (address gin_trgm_ops);

-- ===============================
-- INITIAL DATA
-- ===============================

-- Create admin user (password: admin123)
INSERT INTO users (
    email, password, first_name, last_name, role, is_active, is_verified
) VALUES (
    'admin@yeyzer.ai',
    '$2a$10$3QxDjD1ylgPnRgQLhBrTaeqdsNaLxkk7gpdsFGmMwgP.AXDfKj3tG',
    'Admin',
    'User',
    'ADMIN',
    TRUE,
    TRUE
);
