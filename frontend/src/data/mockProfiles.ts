import { UserProfile, IdealPersona, LinkedInData, GitHubData, TwitterData, CrunchbaseData } from '@yeyzer/types';

// Import existing mock data
import mockUsers from '../../../mock-data/users.json';
import mockLinkedInData from '../../../mock-data/linkedin.json';

// Helper to generate random profile picture URL
const getRandomProfilePicture = (gender: 'men' | 'women' = Math.random() > 0.5 ? 'men' : 'women') => {
  const id = Math.floor(Math.random() * 100); // random ID for picture
  return `https://randomuser.me/api/portraits/${gender}/${id}.jpg`;
};

// Helper to generate random skills
const generateRandomSkills = (count: number = 5): string[] => {
  const allSkills = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust',
    'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'CI/CD', 'GraphQL',
    'PostgreSQL', 'MongoDB', 'Redis', 'Machine Learning', 'AI', 'Data Science',
    'Product Management', 'UX Design', 'UI Design', 'DevOps', 'SRE',
    'Blockchain', 'Cybersecurity', 'Mobile Development', 'iOS', 'Android',
    'Leadership', 'Team Building', 'Strategic Planning', 'Growth Hacking',
    'SEO', 'Content Marketing', 'Sales', 'Business Development'
  ];
  const shuffled = [...allSkills].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Helper to generate random interests
const generateRandomInterests = (count: number = 3): string[] => {
  const allInterests = [
    'Technology', 'Startups', 'Investing', 'Venture Capital', 'Entrepreneurship',
    'Open Source', 'AI Ethics', 'Remote Work', 'Digital Nomad', 'Sustainability',
    'Climate Tech', 'Health Tech', 'EdTech', 'FinTech', 'Blockchain',
    'Photography', 'Travel', 'Food', 'Fitness', 'Meditation',
    'Reading', 'Writing', 'Public Speaking', 'Mentoring', 'Volunteering'
  ];
  const shuffled = [...allInterests].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Helper to generate random social data (GitHub, Twitter, Crunchbase)
const generateMockGitHubData = (userId: string): GitHubData => ({
  userId,
  githubUsername: `githubuser${Math.floor(Math.random() * 1000)}`,
  profileUrl: `https://github.com/githubuser${Math.floor(Math.random() * 1000)}`,
  bio: `Passionate about open source and building scalable software.`,
  company: `TechCorp`,
  location: `San Francisco, CA`,
  blog: `https://techblog.com`,
  publicRepos: Math.floor(Math.random() * 100),
  followers: Math.floor(Math.random() * 5000),
  following: Math.floor(Math.random() * 1000),
  topRepositories: [
    { name: 'project-x', description: 'A cool project', url: 'https://github.com/project-x', stars: 100, forks: 20, language: 'TypeScript' },
  ],
  topLanguages: ['TypeScript', 'Python'],
  contributionCount: Math.floor(Math.random() * 10000),
  lastUpdated: new Date().toISOString(),
});

const generateMockTwitterData = (userId: string): TwitterData => ({
  userId,
  twitterUsername: `twitteruser${Math.floor(Math.random() * 1000)}`,
  profileUrl: `https://twitter.com/twitteruser${Math.floor(Math.random() * 1000)}`,
  displayName: `Twitter User`,
  bio: `Tweeting about tech, AI, and life.`,
  location: `Bay Area`,
  followersCount: Math.floor(Math.random() * 10000),
  followingCount: Math.floor(Math.random() * 2000),
  tweetCount: Math.floor(Math.random() * 5000),
  recentTweets: [
    { id: crypto.randomUUID(), text: 'Just built something awesome!', createdAt: new Date().toISOString(), likeCount: 10, retweetCount: 2, replyCount: 1 },
  ],
  lastUpdated: new Date().toISOString(),
});

const generateMockCrunchbaseData = (userId: string): CrunchbaseData => ({
  userId,
  crunchbaseProfileUrl: `https://www.crunchbase.com/person/cbuser${Math.floor(Math.random() * 1000)}`,
  companyName: `StartupX`,
  role: `Founder`,
  companyDetails: {
    description: `Revolutionizing the industry with AI.`,
    foundedDate: `2020-01-01`,
    industry: ['Software', 'AI'],
    companySize: '11-50',
    headquarters: 'San Francisco, CA',
    website: 'https://startupx.com',
  },
  funding: [
    { round: 'Seed', amount: 1000000, date: new Date().toISOString(), investors: ['VC Fund A'] },
  ],
  lastUpdated: new Date().toISOString(),
});

export interface MockProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  matchScore: number;
  userProfile: UserProfile;
  idealPersona: IdealPersona;
  linkedInData: LinkedInData;
  githubData: GitHubData;
  twitterData: TwitterData;
  crunchbaseData: CrunchbaseData;
}

export const mockFrontendProfiles: MockProfile[] = mockUsers.map((user, index) => {
  const userId = crypto.randomUUID(); // Generate a new UUID for each mock user
  const existingLinkedIn = mockLinkedInData.find(li => li.email === user.email);

  const profilePicture = user.avatarUrl || getRandomProfilePicture(index % 2 === 0 ? 'men' : 'women');

  const skills = generateRandomSkills(Math.floor(Math.random() * 5) + 3);
  const interests = generateRandomInterests(Math.floor(Math.random() * 3) + 2);

  const headline = existingLinkedIn?.headline || `${user.firstName} ${user.lastName} | Professional at ${Math.random() > 0.5 ? 'Tech Company' : 'Startup'}`;
  const bio = existingLinkedIn?.summary || `Professional with experience in ${skills.slice(0, 3).join(', ')}. Passionate about ${interests.slice(0, 2).join(' and ')}.`;

  const location = {
    city: existingLinkedIn?.positions[0]?.company || 'San Francisco',
    state: 'CA',
    country: 'USA',
    coordinates: {
      latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
      longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
    },
  };

  const idealPersona: IdealPersona = {
    userId,
    matchType: Math.random() > 0.5 ? 'COMPLEMENT' : 'MIRROR',
    professionalTraits: generateRandomSkills(Math.floor(Math.random() * 4) + 2),
    personalTraits: generateRandomInterests(Math.floor(Math.random() * 4) + 2),
    skillsDesired: generateRandomSkills(Math.floor(Math.random() * 5) + 3),
    industryPreferences: generateRandomInterests(Math.floor(Math.random() * 3) + 1),
    experienceLevelPreference: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'EXECUTIVE', 'ANY'][Math.floor(Math.random() * 5)],
    meetingPreferences: ['COFFEE', 'LUNCH', 'DINNER', 'DRINKS', 'VIRTUAL', 'ANY'][Math.floor(Math.random() * 6)],
    meetingFrequencyPreference: ['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'OPEN'][Math.floor(Math.random() * 5)],
    description: `Looking to connect with professionals who can ${Math.random() > 0.5 ? 'complement' : 'mirror'} my skills and interests.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    id: userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: profilePicture,
    matchScore: Math.floor(Math.random() * 40) + 60, // Random score between 60-99
    userProfile: {
      userId,
      headline,
      bio,
      location,
      profession: Math.random() > 0.5 ? 'Software Engineer' : 'Product Manager',
      company: `${['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark Industries'][Math.floor(Math.random() * 5)]} Inc.`,
      skills,
      interests,
      education: existingLinkedIn?.educations || [],
      experience: existingLinkedIn?.positions || [],
      privacySettings: {
        showLinkedIn: true,
        showGitHub: true,
        showTwitter: true,
        showCrunchbase: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    idealPersona,
    linkedInData: existingLinkedIn ? { ...existingLinkedIn, userId } : {
      userId,
      linkedInId: `linkedin${Math.floor(Math.random() * 10000)}`,
      profileUrl: `https://www.linkedin.com/in/${user.firstName.toLowerCase()}${user.lastName.toLowerCase()}`,
      headline: `Experienced Professional`,
      summary: `Summary of experience.`,
      industry: `Technology`,
      skills: generateRandomSkills(5),
      positions: [],
      educations: [],
      lastUpdated: new Date().toISOString(),
    },
    githubData: generateMockGitHubData(userId),
    twitterData: generateMockTwitterData(userId),
    crunchbaseData: generateMockCrunchbaseData(userId),
  };
});