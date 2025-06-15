'use client';

import { useState } from 'react';
import Image from 'next/image';
import { mockFrontendProfiles } from '../data/mockProfiles'; // Import mock data

export default function Home() {
  const [activeTab, setActiveTab] = useState('profile');
  const [userProfile, setUserProfile] = useState({
    name: '',
    persona: '',
    about: '',
    interests: '',
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [connectedProfiles, setConnectedProfiles] = useState<string[]>([]);

  // For demonstration, use a subset of mock profiles for matches
  const initialMatches = mockFrontendProfiles.slice(0, 4).map(profile => ({
    ...profile,
    commonInterests: profile.userProfile.interests.slice(0, 2), // Simplified common interests
  }));
  const [matches, setMatches] = useState(initialMatches);
  const [currentChat, setCurrentChat] = useState<any>(null); // Placeholder for current chat partner

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
    setMatches(initialMatches.sort((a, b) => b.matchScore - a.matchScore)); // Re-sort just in case
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const startChat = (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (match) {
      setCurrentChat(match);
      setActiveTab('chat');
    }
  };

  const sendMessage = () => {
    const messageInput = document.getElementById('messageInput') as HTMLInputElement;
    const message = messageInput.value.trim();
    if (!message || !currentChat) return;

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      const userMessage = document.createElement('div');
      userMessage.className = 'message sent';
      userMessage.innerHTML = `<strong>You</strong><br>${message}`;
      chatMessages.appendChild(userMessage);
      messageInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;

      setTimeout(() => {
        const responses = [
          "That's really interesting! Tell me more about that.",
          "I completely agree! I've had similar experiences.",
          "That sounds amazing. I'd love to hear more details.",
          "Great point! I never thought about it that way.",
          "I share your passion for that too!"
        ];
        const response = responses[Math.floor(Math.random() * responses.length)];
        const botMessage = document.createElement('div');
        botMessage.className = 'message received';
        botMessage.innerHTML = `<strong>${currentChat.firstName}</strong><br>${response}`;
        chatMessages.appendChild(botMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }, 1000);
    }
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

  return (
    <div className="container-mobile">
      <div className="header-gradient">
        <h1>Yeyzer AI</h1>
        <p>Intelligent Persona Matching</p>
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
        <button
          className={`nav-tab ${activeTab === 'connections' ? 'active' : ''}`}
          onClick={() => setActiveTab('connections')}
        >
          Connect
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div id="profile" className="tab-content active p-5">
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
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
            <label htmlFor="persona">Define Your Ideal Match</label>
            <textarea
              id="persona"
              className="form-control"
              placeholder="Describe what interests you and what you're looking for in a match. Be specific about values, interests, career goals, lifestyle, etc."
              value={userProfile.persona}
              onChange={handleInputChange}
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="about">About You</label>
            <textarea
              id="about"
              className="form-control"
              placeholder="Tell us about yourself - your interests, background, what makes you unique..."
              value={userProfile.about}
              onChange={handleInputChange}
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="interests">Key Interests (comma-separated)</label>
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
                    <div className="avatar mr-3">
                      {match.avatarUrl ? (
                        <Image src={match.avatarUrl} alt={`${match.firstName} ${match.lastName}`} width={50} height={50} className="rounded-full" />
                      ) : (
                        `${match.firstName[0]}${match.lastName[0]}`
                      )}
                    </div>
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
            {currentChat ? (
              <>
                <h3 className="text-lg font-semibold mb-4">Chat with {currentChat.firstName} {currentChat.lastName}</h3>
                <div className="chat-messages h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50" id="chatMessages">
                  <div className="message received bg-white border border-gray-200 p-2 rounded-lg max-w-xs mb-3">
                    <strong>{currentChat.firstName}</strong><br />
                    Hi {userProfile.name}! I saw we have a {currentChat.matchScore}% match. I'd love to chat about our shared interests!
                  </div>
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
            ) : (
              <div className="empty-state">
                <h3>Start Chatting</h3>
                <p>Match with someone first to start a conversation.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connections Tab */}
      {activeTab === 'connections' && (
        <div id="connections" className="tab-content active p-5">
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
      )}
    </div>
  );
}
