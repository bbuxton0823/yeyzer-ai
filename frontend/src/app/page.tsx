'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { mockFrontendProfiles, type MockProfile } from '../data/mockProfiles'; // Import mock data & type
import { Venue } from '@yeyzer/types'; // Assuming Venue type is available

// Define a type for chat messages
interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isSent: boolean; // true if sent by current user, false if received
  timestamp: string;
}

// Extend MockProfile to include venue recommendations
interface MatchWithVenues extends MockProfile {
  venueRecommendations: Venue[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('profile'); // Only 'profile', 'matches', 'chat'
  const [userProfile, setUserProfile] = useState({
    name: '',
    persona: '',
    about: '',
    interests: '',
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [connectedProfiles, setConnectedProfiles] = useState<string[]>([]);

  // Enhance mock profiles with venue recommendations
  const enhancedMockProfiles: MatchWithVenues[] = mockFrontendProfiles.map(profile => ({
    ...profile,
    venueRecommendations: [
      {
        id: `venue-${profile.id}-1`,
        googlePlaceId: `place-${profile.id}-1`,
        name: `Coffee Spot near ${profile.userProfile.location.city}`,
        address: `123 Main St, ${profile.userProfile.location.city}`,
        latitude: profile.userProfile.location.coordinates?.latitude || 0,
        longitude: profile.userProfile.location.coordinates?.longitude || 0,
        phone: '555-123-4567',
        website: 'https://example.com',
        rating: 4.5,
        userRatingsCount: 100,
        priceLevel: '2',
        types: ['cafe'],
        photos: [],
        openingHours: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `venue-${profile.id}-2`,
        googlePlaceId: `place-${profile.id}-2`,
        name: `Restaurant in ${profile.userProfile.location.city}`,
        address: `456 Oak Ave, ${profile.userProfile.location.city}`,
        latitude: profile.userProfile.location.coordinates?.latitude || 0,
        longitude: profile.userProfile.location.coordinates?.longitude || 0,
        phone: '555-987-6543',
        website: 'https://example.com',
        rating: 4.2,
        userRatingsCount: 150,
        priceLevel: '3',
        types: ['restaurant'],
        photos: [],
        openingHours: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }));

  const initialMatches = enhancedMockProfiles.map(profile => ({
    ...profile,
    commonInterests: profile.userProfile.interests.slice(0, 2), // Simplified common interests
  }));
  const [matches, setMatches] = useState<MatchWithVenues[]>(initialMatches);

  // State to store all chat messages, keyed by matchId
  const [allChatMessages, setAllChatMessages] = useState<Map<string, ChatMessage[]>>(new Map());
  const [currentChatMatchId, setCurrentChatMatchId] = useState<string | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat messages
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allChatMessages, currentChatMatchId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setUserProfile(prev => ({ ...prev, [id]: value }));
  };

  const saveProfile = () => {
    if (!userProfile.name || !userProfile.persona || !userProfile.about) {
      alert('Please fill in all required fields');
      return;
    }
    setProfileSaved(true);
    // In a real app, this would trigger an API call to update the profile and re-calculate matches
    // For now, we'll just display the mock matches
    setMatches(prevMatches => [...prevMatches].sort((a, b) => b.matchScore - a.matchScore)); // Re-sort just in case
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const startChat = (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (match) {
      setCurrentChatMatchId(matchId);
      // Initialize chat messages if not already present
      if (!allChatMessages.has(matchId)) {
        setAllChatMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(matchId, [{
            id: `msg-initial-${matchId}`,
            senderId: match.id, // Matched user is sender
            receiverId: 'currentUser', // Current user is receiver
            content: `Hi ${userProfile.name}! I saw we have a ${match.matchScore}% match. I'd love to chat about our shared interests!`,
            isSent: false,
            timestamp: new Date().toISOString(),
          }]);
          return newMap;
        });
      }
      setActiveTab('chat');
    }
  };

  const sendMessage = () => {
    const messageInput = document.getElementById('messageInput') as HTMLInputElement;
    const messageContent = messageInput.value.trim();
    if (!messageContent || !currentChatMatchId) return;

    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: 'currentUser',
      receiverId: currentChatMatchId,
      content: messageContent,
      isSent: true,
      timestamp: new Date().toISOString(),
    };

    setAllChatMessages(prev => {
      const newMap = new Map(prev);
      const currentChatMessages = newMap.get(currentChatMatchId) || [];
      newMap.set(currentChatMatchId, [...currentChatMessages, newMessage]);
      return newMap;
    });

    messageInput.value = '';

    // Simulate response after delay
    setTimeout(() => {
      const responses = [
        "That's really interesting! Tell me more about that.",
        "I completely agree! I've had similar experiences.",
        "That sounds amazing. I'd love to hear more details.",
        "Great point! I never thought about it that way.",
        "I share your passion for that too!"
      ];
      const responseContent = responses[Math.floor(Math.random() * responses.length)];
      const botMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: currentChatMatchId,
        receiverId: 'currentUser',
        content: responseContent,
        isSent: false,
        timestamp: new Date().toISOString(),
      };
      setAllChatMessages(prev => {
        const newMap = new Map(prev);
        const currentChatMessages = newMap.get(currentChatMatchId) || [];
        newMap.set(currentChatMatchId, [...currentChatMessages, botMessage]);
        return newMap;
      });
    }, 1000);
  };

  const handleMessageKeypress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const viewProfile = (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (match) {
      alert(`Profile: ${match.firstName} ${match.lastName}\n\nAbout: ${match.userProfile.bio}\n\nPersona: ${match.idealPersona.description}\n\nInterests: ${match.userProfile.interests.join(', ')}`);
    }
  };

  const connectProfile = (platform: string) => {
    if (!connectedProfiles.includes(platform)) {
      setConnectedProfiles(prev => [...prev, platform]);
      const statusElement = document.getElementById('connectionStatus');
      if (statusElement) {
        statusElement.style.display = 'block';
        statusElement.textContent = `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully! This will improve your match quality.`;
        setTimeout(() => {
          statusElement.style.display = 'none';
        }, 3000);
      }
    }
  };

  const currentChatMessages = currentChatMatchId ? allChatMessages.get(currentChatMatchId) : [];
  const currentChatPartner = currentChatMatchId ? matches.find(m => m.id === currentChatMatchId) : null;

  return (
    <div className="container-mobile">
      <div className="header-gradient">
        <h1 className="text-2xl font-bold mb-1">Yeyzer AI</h1>
        <p className="opacity-90 text-sm">Intelligent Persona Matching</p>
      </div>

      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          className={`nav-tab ${activeTab === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveTab('matches')}
        >
          Matches
        </button>
        <button
          className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
      </div>

      {/* Profile Tab (Combined with Connect) */}
      {activeTab === 'profile' && (
        <div id="profile" className="tab-content active p-5 overflow-y-auto h-[calc(100vh-140px)]">
          <div className="form-group">
            <label htmlFor="name" className="block mb-2 font-semibold text-text-primary">Your Name</label>
            <input
              type="text"
              id="name"
              className="form-control"
              placeholder="Enter your name"
              value={userProfile.name}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="persona" className="block mb-2 font-semibold text-text-primary">Define Your Ideal Match</label>
            <textarea
              id="persona"
              className="form-control min-h-[100px]"
              placeholder="Describe what interests you and what you're looking for in a match. Be specific about values, interests, career goals, lifestyle, etc."
              value={userProfile.persona}
              onChange={handleInputChange}
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="about" className="block mb-2 font-semibold text-text-primary">About You</label>
            <textarea
              id="about"
              className="form-control min-h-[100px]"
              placeholder="Tell us about yourself - your interests, background, what makes you unique..."
              value={userProfile.about}
              onChange={handleInputChange}
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="interests" className="block mb-2 font-semibold text-text-primary">Key Interests (comma-separated)</label>
            <input
              type="text"
              id="interests"
              className="form-control"
              placeholder="e.g., technology, startups, design, travel"
              value={userProfile.interests}
              onChange={handleInputChange}
            />
          </div>

          <button className="btn" onClick={saveProfile}>
            Save Profile & Find Matches
          </button>

          {profileSaved && (
            <div id="profileSaved" className="success-message mt-5 fade-in">
              Profile saved successfully! Check the Matches tab to see your personalized matches.
            </div>
          )}

          {/* Connect Profiles Section */}
          <div className="mt-8 pt-5 border-t border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Connect Your Profiles</h3>
            <p className="text-sm text-gray-600 mb-4">
              Connect your social and professional profiles to improve match accuracy.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <button
                className={`connection-btn ${connectedProfiles.includes('linkedin') ? 'connected' : ''}`}
                onClick={() => connectProfile('linkedin')}
              >
                <div className="text-2xl mb-2">💼</div>
                <div className="text-xs font-semibold">LinkedIn</div>
              </button>
              <button
                className={`connection-btn ${connectedProfiles.includes('github') ? 'connected' : ''}`}
                onClick={() => connectProfile('github')}
              >
                <div className="text-2xl mb-2">💻</div>
                <div className="text-xs font-semibold">GitHub</div>
              </button>
              <button
                className={`connection-btn ${connectedProfiles.includes('twitter') ? 'connected' : ''}`}
                onClick={() => connectProfile('twitter')}
              >
                <div className="text-2xl mb-2">🐦</div>
                <div className="text-xs font-semibold">Twitter</div>
              </button>
              <button
                className={`connection-btn ${connectedProfiles.includes('instagram') ? 'connected' : ''}`}
                onClick={() => connectProfile('instagram')}
              >
                <div className="text-2xl mb-2">📸</div>
                <div className="text-xs font-semibold">Instagram</div>
              </button>
            </div>

            <div id="connectionStatus" style={{ display: 'none' }} className="success-message">
              Profile connected successfully! This will improve your match quality.
            </div>
          </div>
        </div>
      )}

      {/* Matches Tab */}
      {activeTab === 'matches' && (
        <div id="matches" className="tab-content active p-5">
          <div id="matchesContent">
            {matches.length === 0 ? (
              <div className="empty-state">
                <h3>No Matches Yet</h3>
                <p>Complete your profile first to see intelligent matches based on your ideal persona.</p>
              </div>
            ) : (
              matches.map(match => (
                <div key={match.id} className="match-card fade-in">
                  <div className="flex items-center mb-4">
                    {match.avatarUrl ? (
                      <Image
                        src={match.avatarUrl}
                        alt={`${match.firstName} ${match.lastName}`}
                        width={50}
                        height={50}
                        className="w-12 h-12 rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-12 h-12 mr-3 rounded-full bg-primary-dark text-white flex items-center justify-center font-bold">
                        {match.firstName[0]}
                        {match.lastName[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{match.firstName} {match.lastName}</h3>
                      <div className="match-score">{match.matchScore}% Match</div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    {match.userProfile.bio}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {match.userProfile.interests.map(interest => (
                      <span key={interest} className="tag">
                        {interest}
                      </span>
                    ))}
                  </div>

                  {match.commonInterests && match.commonInterests.length > 0 && (
                    <div className="text-xs text-green-700 mb-4">
                      <strong>Common interests:</strong> {match.commonInterests.join(', ')}
                    </div>
                  )}

                  {/* Venue Recommendations */}
                  {match.venueRecommendations && match.venueRecommendations.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold mb-2">Recommended Venues:</h4>
                      <div className="space-y-2">
                        {match.venueRecommendations.map(venue => (
                          <div key={venue.id} className="bg-surface p-2 rounded-md text-xs">
                            <div className="font-semibold">{venue.name}</div>
                            <div>{venue.address}</div>
                            <div className="flex items-center mt-1">
                              <span className="text-yellow-500 mr-1">★</span>
                              <span>{venue.rating}</span>
                              <span className="mx-2">•</span>
                              <span>{venue.types[0]}</span>
                              <span className="mx-2">•</span>
                              <span>{"$".repeat(parseInt(venue.priceLevel))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button className="btn btn-sm" onClick={() => startChat(match.id)}>
                      Message
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => viewProfile(match.id)}>
                      View Profile
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div id="chat" className="tab-content active p-5">
          <div id="chatContent">
            {allChatMessages.size === 0 ? (
              <div className="empty-state">
                <h3>Start Chatting</h3>
                <p>Match with someone first to start a conversation.</p>
              </div>
            ) : (
              <>
                {/* Chat Partner Selector */}
                {allChatMessages.size > 1 && (
                  <div className="mb-4">
                    <label className="block mb-2 text-sm font-semibold">Select Conversation:</label>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {Array.from(allChatMessages.keys()).map(matchId => {
                        const partner = matches.find(m => m.id === matchId);
                        return (
                          <button
                            key={matchId}
                            onClick={() => setCurrentChatMatchId(matchId)}
                            className={`px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
                              currentChatMatchId === matchId
                                ? 'bg-primary-DEFAULT text-white'
                                : 'bg-surface text-text-primary'
                            }`}
                          >
                            {partner ? `${partner.firstName} ${partner.lastName}` : 'Unknown'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {currentChatPartner && (
                  <>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      {currentChatPartner.avatarUrl && (
                        <Image
                          src={currentChatPartner.avatarUrl}
                          alt={`${currentChatPartner.firstName} ${currentChatPartner.lastName}`}
                          width={30}
                          height={30}
                          className="rounded-full mr-2"
                        />
                      )}
                      Chat with {currentChatPartner.firstName} {currentChatPartner.lastName}
                    </h3>
                    <div className="chat-messages h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50" id="chatMessages">
                      {currentChatMessages && currentChatMessages.map(message => (
                        <div
                          key={message.id}
                          className={`message ${message.isSent ? 'sent' : 'received'} mb-3 p-3 rounded-lg max-w-xs ${
                            message.isSent
                              ? 'bg-primary-DEFAULT text-white ml-auto'
                              : 'bg-white border border-gray-200'
                          }`}
                        >
                          <div className="font-semibold text-xs mb-1">
                            {message.isSent
                              ? 'You'
                              : `${currentChatPartner.firstName} ${currentChatPartner.lastName}`}
                          </div>
                          {message.content}
                        </div>
                      ))}
                      <div ref={chatMessagesEndRef} />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="messageInput"
                        className="form-control flex-1"
                        placeholder="Type your message..."
                        onKeyPress={handleMessageKeypress}
                      />
                      <button className="btn btn-sm" onClick={sendMessage}>
                        Send
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
