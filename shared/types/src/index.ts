import { z } from 'zod';

// ===== Common Types =====

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  requestId: z.string().uuid().optional(),
});

export const ErrorResponseSchema = ApiResponseSchema.extend({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const PaginatedMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export const PaginatedResponseSchema = ApiResponseSchema.extend({
  meta: PaginatedMetaSchema,
  data: z.array(z.any()),
});

// ===== User Types =====

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable(),
  isActive: z.boolean().default(true),
  isVerified: z.boolean().default(false),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
});

export const UserProfileSchema = z.object({
  userId: z.string().uuid(),
  headline: z.string().max(160).optional(),
  bio: z.string().max(1000).optional(),
  location: z.object({
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }).optional(),
  }),
  profession: z.string().optional(),
  company: z.string().optional(),
  skills: z.array(z.string()).default([]),
  interests: z.array(z.string()).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    startYear: z.number().int().optional(),
    endYear: z.number().int().optional(),
    current: z.boolean().default(false),
  })).default([]),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    description: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    current: z.boolean().default(false),
  })).default([]),
  privacySettings: z.object({
    showLinkedIn: z.boolean().default(true),
    showGitHub: z.boolean().default(true),
    showTwitter: z.boolean().default(true),
    showCrunchbase: z.boolean().default(true),
  }).default({
    showLinkedIn: true,
    showGitHub: true,
    showTwitter: true,
    showCrunchbase: true,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const IdealPersonaSchema = z.object({
  userId: z.string().uuid(),
  matchType: z.enum(['COMPLEMENT', 'MIRROR']).default('COMPLEMENT'),
  professionalTraits: z.array(z.string()).default([]),
  personalTraits: z.array(z.string()).default([]),
  skillsDesired: z.array(z.string()).default([]),
  industryPreferences: z.array(z.string()).default([]),
  experienceLevelPreference: z.enum([
    'ENTRY_LEVEL',
    'MID_LEVEL',
    'SENIOR',
    'EXECUTIVE',
    'ANY'
  ]).default('ANY'),
  meetingPreferences: z.array(z.enum([
    'COFFEE',
    'LUNCH',
    'DINNER',
    'DRINKS',
    'VIRTUAL',
    'ANY'
  ])).default(['ANY']),
  meetingFrequencyPreference: z.enum([
    'ONE_TIME',
    'WEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'OPEN'
  ]).default('OPEN'),
  description: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== Authentication Types =====

export const AuthPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  iat: z.number(),
  exp: z.number(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  expiresAt: z.string().datetime(),
  isValid: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    token: z.string(),
    refreshToken: z.string().optional(),
    user: UserSchema,
  }),
});

// ===== Social Data Types =====

export const LinkedInDataSchema = z.object({
  userId: z.string().uuid(),
  linkedInId: z.string(),
  profileUrl: z.string().url(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  industry: z.string().optional(),
  skills: z.array(z.string()).default([]),
  positions: z.array(z.object({
    title: z.string(),
    company: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    current: z.boolean().default(false),
    description: z.string().optional(),
  })).default([]),
  educations: z.array(z.object({
    school: z.string(),
    degree: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).default([]),
  lastUpdated: z.string().datetime(),
});

export const GitHubDataSchema = z.object({
  userId: z.string().uuid(),
  githubUsername: z.string(),
  profileUrl: z.string().url(),
  bio: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  blog: z.string().url().optional(),
  publicRepos: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  topRepositories: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    url: z.string().url(),
    stars: z.number().int().nonnegative(),
    forks: z.number().int().nonnegative(),
    language: z.string().optional(),
  })).default([]),
  topLanguages: z.array(z.string()).default([]),
  contributionCount: z.number().int().nonnegative(),
  lastUpdated: z.string().datetime(),
});

export const TwitterDataSchema = z.object({
  userId: z.string().uuid(),
  twitterUsername: z.string(),
  profileUrl: z.string().url(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  followersCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  tweetCount: z.number().int().nonnegative(),
  recentTweets: z.array(z.object({
    id: z.string(),
    text: z.string(),
    createdAt: z.string().datetime(),
    likeCount: z.number().int().nonnegative(),
    retweetCount: z.number().int().nonnegative(),
    replyCount: z.number().int().nonnegative(),
  })).default([]),
  lastUpdated: z.string().datetime(),
});

export const CrunchbaseDataSchema = z.object({
  userId: z.string().uuid(),
  crunchbaseProfileUrl: z.string().url().optional(),
  companyName: z.string().optional(),
  role: z.string().optional(),
  companyDetails: z.object({
    description: z.string().optional(),
    foundedDate: z.string().optional(),
    industry: z.array(z.string()).default([]),
    companySize: z.string().optional(),
    headquarters: z.string().optional(),
    website: z.string().url().optional(),
  }).optional(),
  funding: z.array(z.object({
    round: z.string(),
    amount: z.number().optional(),
    date: z.string().datetime(),
    investors: z.array(z.string()).default([]),
  })).default([]),
  lastUpdated: z.string().datetime(),
});

// ===== Match Types =====

export const MatchStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED'
]);

export const MatchScoreSchema = z.object({
  overall: z.number().min(0).max(1),
  professionalFit: z.number().min(0).max(1),
  personalFit: z.number().min(0).max(1),
  skillsAlignment: z.number().min(0).max(1),
  industryAlignment: z.number().min(0).max(1),
  experienceCompatibility: z.number().min(0).max(1),
  details: z.record(z.string(), z.number()).optional(),
});

export const MatchSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  matchedUserId: z.string().uuid(),
  score: MatchScoreSchema,
  status: MatchStatusEnum.default('PENDING'),
  icebreakerId: z.string().uuid().optional(),
  scheduledVenueId: z.string().uuid().optional(),
  scheduledTime: z.string().datetime().optional(),
  userFeedback: z.number().int().min(1).max(5).optional(),
  matchedUserFeedback: z.number().int().min(1).max(5).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== Conversation Types =====

export const IcebreakerSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  text: z.string(),
  generatedBy: z.enum(['SYSTEM', 'USER']).default('SYSTEM'),
  accepted: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MessageSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().uuid(),
  senderId: z.string().uuid(),
  receiverId: z.string().uuid(),
  content: z.string(),
  read: z.boolean().default(false),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ChatSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  user1Id: z.string().uuid(),
  user2Id: z.string().uuid(),
  lastMessageAt: z.string().datetime().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(MessageSchema).optional(),
});

// ===== Venue Types =====

export const VenueTypeEnum = z.enum([
  'CAFE',
  'RESTAURANT',
  'BAR',
  'COWORKING',
  'PARK',
  'OTHER'
]);

export const VenuePriceEnum = z.enum(['1', '2', '3', '4']);

export const VenueSchema = z.object({
  id: z.string().uuid(),
  googlePlaceId: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingsCount: z.number().int().nonnegative().optional(),
  priceLevel: VenuePriceEnum.optional(),
  types: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  openingHours: z.record(z.string(), z.array(z.string())).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const VenueRecommendationSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  venueId: z.string().uuid(),
  venue: VenueSchema.optional(),
  reason: z.string().optional(),
  distanceFromMidpoint: z.number().nonnegative().optional(),
  selected: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== Voice Types =====

export const VoiceCommandTypeEnum = z.enum([
  'WAKE',
  'MATCH',
  'CHAT',
  'VENUE',
  'SCHEDULE',
  'HELP',
  'CANCEL',
  'UNKNOWN'
]);

export const VoiceCommandSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  audioUrl: z.string().url().optional(),
  transcription: z.string(),
  commandType: VoiceCommandTypeEnum,
  confidence: z.number().min(0).max(1),
  processedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const VoiceSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  active: z.boolean().default(true),
  deviceInfo: z.object({
    type: z.string().optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
  commands: z.array(VoiceCommandSchema).optional(),
});

// ===== Safety Types =====

export const SafetyReportReasonEnum = z.enum([
  'INAPPROPRIATE_CONTENT',
  'HARASSMENT',
  'SPAM',
  'FAKE_PROFILE',
  'OTHER'
]);

export const SafetyReportSchema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  matchId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  reason: SafetyReportReasonEnum,
  details: z.string().optional(),
  status: z.enum(['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']).default('PENDING'),
  adminNotes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});

export const CheckInSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  matchId: z.string().uuid(),
  scheduledTime: z.string().datetime(),
  checkInTime: z.string().datetime().nullable(),
  status: z.enum(['PENDING', 'COMPLETED', 'MISSED']).default('PENDING'),
  response: z.enum(['SAFE', 'UNSAFE', 'NO_RESPONSE']).nullable(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ===== Type Exports =====

// Common Types
export type ApiResponse<T = undefined> = z.infer<typeof ApiResponseSchema> & (T extends undefined ? {} : { data: T });
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginatedMeta = z.infer<typeof PaginatedMetaSchema>;
export type PaginatedResponse<T> = Omit<z.infer<typeof PaginatedResponseSchema>, 'data'> & { data: T[] };

// User Types
export type User = z.infer<typeof UserSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type IdealPersona = z.infer<typeof IdealPersonaSchema>;

// Authentication Types
export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Social Data Types
export type LinkedInData = z.infer<typeof LinkedInDataSchema>;
export type GitHubData = z.infer<typeof GitHubDataSchema>;
export type TwitterData = z.infer<typeof TwitterDataSchema>;
export type CrunchbaseData = z.infer<typeof CrunchbaseDataSchema>;

// Match Types
export type MatchStatus = z.infer<typeof MatchStatusEnum>;
export type MatchScore = z.infer<typeof MatchScoreSchema>;
export type Match = z.infer<typeof MatchSchema>;

// Conversation Types
export type Icebreaker = z.infer<typeof IcebreakerSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Chat = z.infer<typeof ChatSchema>;

// Venue Types
export type VenueType = z.infer<typeof VenueTypeEnum>;
export type VenuePrice = z.infer<typeof VenuePriceEnum>;
export type Venue = z.infer<typeof VenueSchema>;
export type VenueRecommendation = z.infer<typeof VenueRecommendationSchema>;

// Voice Types
export type VoiceCommandType = z.infer<typeof VoiceCommandTypeEnum>;
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

// Safety Types
export type SafetyReportReason = z.infer<typeof SafetyReportReasonEnum>;
export type SafetyReport = z.infer<typeof SafetyReportSchema>;
export type CheckIn = z.infer<typeof CheckInSchema>;
