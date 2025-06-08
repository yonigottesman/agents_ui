'use client';

import { useState, useRef, useEffect } from 'react';
import PartRenderer from './components/PartRenderer';
import SessionPanel from './components/SessionPanel';
import { API_CONFIG, buildApiUrl } from './config/api';

interface ChatMessage {
  role: 'user' | 'model';
  timestamp: string;
  content: string;
  parts?: any[]; // Add parts field to ChatMessage
}

// Add interface for ModelMessage from backend
interface ModelMessage {
  kind: 'request' | 'response';
  parts?: any[]; // Parts field that we want to extract
  [key: string]: any;
}

function decodeJWT(token: string) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonPayload);
}

function handleUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [currentAgent, setCurrentAgent] = useState<string>('search_bot');
  const [availableAgents, setAvailableAgents] = useState<string[]>(['search_bot']);
  const [sessionsRefreshTrigger, setSessionsRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Generate a new session ID from the backend
  const generateSessionId = async (agentName: string = 'search_bot') => {
    try {
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.NEW_SESSION), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_name: agentName }),
        credentials: 'include',
      });
      if (handleUnauthorized(response)) return;
      const data = await response.json();
      return data.session_id;
    } catch (error) {
      console.error('Error generating session ID:', error);
    }
    // Fallback to client-side generation if backend fails
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Fetch available agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.AGENTS), {
          credentials: 'include',
        });
        if (handleUnauthorized(response)) return;
        const agents: string[] = await response.json();
        if (agents && agents.length > 0) {
          setAvailableAgents(agents);
          setCurrentAgent(agents[0]);
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
      }
    };
    fetchAgents();
  }, []);

  // On component mount, don't load any session - just stay on welcome page
  useEffect(() => {
    // Clear any session ID so we start on the welcome page
    setCurrentSessionId('');
    
    // Just make sure we have the latest agents list
    const fetchAgents = async () => {
      try {
        const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.AGENTS), {
          credentials: 'include',
        });
        if (handleUnauthorized(response)) return;
        const agents: string[] = await response.json();
        if (agents && agents.length > 0) {
          setAvailableAgents(agents);
          // Update current agent selection but don't load a session
          setCurrentAgent(agents[0]);
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
      }
    };
    
    // Only fetch agents once on mount, don't load any session
    fetchAgents();
    
    console.log('Starting on welcome page. Select a session or create a new one.');
  }, []);

  // Load chat history when session changes
  useEffect(() => {
    if (currentSessionId) {
      loadChatHistory(currentSessionId);
    }
  }, [currentSessionId]);

  const loadChatHistory = async (sessionId: string) => {
    try {
      // Get chat messages
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.CHAT, { session_id: sessionId }), {
        credentials: 'include',
      });
      if (handleUnauthorized(response)) return;
      const modelMessages: ModelMessage[] = await response.json();
      
      // Convert ModelMessage objects to ChatMessage format for display
      const chatMessages: ChatMessage[] = modelMessages.map((msg, index) => ({
        role: msg.kind === 'request' ? 'user' : 'model',
        timestamp: new Date().toISOString(), // Using current time since we don't have timestamp in ModelMessage
        content: msg.parts ? '' : 'No parts field available', // We'll use parts field directly
        parts: msg.parts || []
      }));
      
      setMessages(chatMessages);
      
      try {
        // Get session data to update the current agent
        const sessionsResponse = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.SESSIONS), {
          credentials: 'include',
        });
        if (handleUnauthorized(sessionsResponse)) return;
        const sessions = await sessionsResponse.json();
        
        // Find current session and update agent
        const currentSession = sessions.find((session: any) => session.id === sessionId);
        if (currentSession && currentSession.agent_name) {
          setCurrentAgent(currentSession.agent_name);
        } else {
          // Keep the current agent if we can't find the session
          console.log('Session agent not found, keeping current agent:', currentAgent);
        }
      } catch (sessionError) {
        console.error('Error getting session data:', sessionError);
        // Session info failed, but we already got the messages so we can continue
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleNewSession = async (agentName: string) => {
    const newSessionId = await generateSessionId(agentName);
    setCurrentSessionId(newSessionId);
    setCurrentAgent(agentName);
    setMessages([]);
    // Trigger sessions refresh to update the list immediately
    setSessionsRefreshTrigger(prev => prev + 1);
  };
  
  const handleSessionDelete = (sessionId: string) => {
    if (sessionId === currentSessionId) {
      // If currently selected session is deleted, clear the selection
      setCurrentSessionId('');
      setMessages([]);
    }
    // Trigger sessions refresh to update the list
    setSessionsRefreshTrigger(prev => prev + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentSessionId) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Don't add user message immediately - only display streamed messages

    try {
      const formData = new FormData();
      formData.append('prompt', userMessage);
      formData.append('session_id', currentSessionId);

      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.CHAT), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (handleUnauthorized(response)) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            // Try to parse the line as JSON (ModelRequest/ModelResponse)
            const parsedMessage = JSON.parse(line);
            
            // Only display messages from the stream based on their "kind" field
            if (parsedMessage.kind === 'request') {
              // Display as user message
              const userChatMessage: ChatMessage = {
                role: 'user',
                timestamp: new Date().toISOString(),
                content: parsedMessage.parts ? '' : 'No parts field available',
                parts: parsedMessage.parts || []
              };
              setMessages(prev => [...prev, userChatMessage]);
            } else if (parsedMessage.kind === 'response') {
              // Display as agent response
              const agentMessage: ChatMessage = {
                role: 'model',
                timestamp: new Date().toISOString(),
                content: parsedMessage.parts ? '' : 'No parts field available',
                parts: parsedMessage.parts || []
              };
              setMessages(prev => [...prev, agentMessage]);
            }
          } catch (error) {
            // If it's not valid JSON, skip this line
            console.warn('Skipping non-JSON line:', line);
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'model',
        timestamp: new Date().toISOString(),
        content: 'Sorry, there was an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
      // Trigger sessions refresh to update the list
      setSessionsRefreshTrigger(prev => prev + 1);
    }
  };

  useEffect(() => {
    // Load Google Identity Services script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);

    // Wait for script to load, then initialize
    script.onload = () => {
      // @ts-ignore
      window.google.accounts.id.initialize({
        client_id: API_CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
      });
      // @ts-ignore
      window.google.accounts.id.renderButton(
        document.getElementById("g_id_signin"),
        { theme: "outline", size: "large" }
      );
    };
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function handleCredentialResponse(response: any) {
    const credential = response.credential;
    // Optionally decode and log user info
    // const responsePayload = decodeJWT(credential);
    // console.log(responsePayload);
    // Send credential to backend
    const res = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.GOOGLE_AUTH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
      credentials: "include",
    });
    if (res.ok) {
      // Optionally handle token, redirect, etc.
      window.location.reload();
    } else {
      alert("Google authentication failed");
    }
  }

  // Expose handler globally for Google callback
  // @ts-ignore
  if (typeof window !== "undefined") window.handleCredentialResponse = handleCredentialResponse;

  function logout() {
    fetch(buildApiUrl(API_CONFIG.ENDPOINTS.LOGOUT), {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      window.location.href = '/login';
    });
  }

  return (
    <div className="h-screen bg-[#0f0f0f] flex flex-col overflow-hidden">
      {/* Minimalistic Navbar - At the top */}
      <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] p-4 flex-shrink-0 flex items-center justify-between z-10">
        <h1 className="text-xl font-semibold text-white">Agents</h1>
        <button onClick={logout} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors border border-[#3a3a3a] shadow-sm">Logout</button>
      </header>
      
      {/* Content area - Below navbar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Session Panel - Left sidebar */}
        <div className="flex-shrink-0">
          <SessionPanel
            currentSessionId={currentSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={handleNewSession}
            refreshTrigger={sessionsRefreshTrigger}
            availableAgents={availableAgents}
            onSessionDelete={handleSessionDelete}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">

        {/* Messages Container - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!currentSessionId ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center p-8 max-w-2xl">
                <h3 className="text-2xl font-semibold text-gray-300 mb-4">Welcome to Agents</h3>
                <p className="text-gray-400 mb-6">To get started, click the "NEW CHAT" button on the left to create a new session with your selected agent.</p>
                <div className="flex justify-center">
                  <div className="bg-[#2a2a2a] p-4 rounded-lg border border-[#3a3a3a] text-gray-300 text-sm">
                    <div className="mb-3 font-medium">Available agents:</div>
                    <ul className="text-left space-y-2">
                      {availableAgents.map(agent => (
                        <li key={agent} className="flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                          <span>{agent}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center p-8 max-w-2xl">
                    {currentAgent && (
                      <div className="mb-4 px-3 py-1 bg-[#2a2a2a] rounded-md border border-[#3a3a3a] inline-block">
                        <span className="text-sm text-gray-300">Agent:</span>
                        <span className="ml-2 text-sm font-medium text-blue-400">{currentAgent}</span>
                      </div>
                    )}
                    <h3 className="text-2xl font-semibold text-gray-300 mb-4">Ask {currentAgent} anything</h3>
                  </div>
                </div>
              ) : (
                <>
                {/* Agent banner at the top of messages */}
                {currentAgent && (
                  <div className="mb-4 px-3 py-1 bg-[#2a2a2a] rounded-md border border-[#3a3a3a] inline-block">
                    <span className="text-sm text-gray-300">Agent:</span>
                    <span className="ml-2 text-sm font-medium text-blue-400">{currentAgent}</span>
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-4xl rounded-lg p-4 ${
                      message.role === 'user' 
                        ? 'bg-[#2a2a2a] border border-[#3a3a3a] text-white' 
                        : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-100'
                    }`}>
                      <div className={`text-xs mb-3 font-semibold ${
                        message.role === 'user' ? 'text-blue-400' : 'text-green-400'
                      }`}>
                        {message.role === 'user' ? 'USER' : 'AGENT'} • {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                      
                      {message.parts && message.parts.length > 0 ? (
                        <PartRenderer parts={message.parts} />
                      ) : (
                        <div className="text-gray-300 italic">{message.content}</div>
                      )}
                    </div>
                  </div>
                ))}
              </>
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                      <span className="text-gray-400">Agent is typing...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Form - Fixed at bottom */}
        <div className="bg-[#1a1a1a] border-t border-[#2a2a2a] p-4 flex-shrink-0">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex space-x-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={!currentSessionId ? "Create a new chat to start messaging..." : "Type your message..."}
                className="flex-1 px-4 py-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-500"
                disabled={isLoading || !currentSessionId}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || !currentSessionId}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                Send
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
