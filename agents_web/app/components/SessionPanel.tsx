'use client';

import { useState, useEffect, useRef } from 'react';
import { API_CONFIG, buildApiUrl } from '../config/api';

interface Session {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  agent_name: string;
}

interface SessionPanelProps {
  currentSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: (agentName: string) => void;
  refreshTrigger?: number;
  availableAgents: string[];
  onSessionDelete?: (sessionId: string) => void;
}

const getColorForSession = (sessionId: string) => {
  let hash = 0;
  if (sessionId.length === 0) return 'bg-gray-400';
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  const colors = ['bg-blue-400', 'bg-green-400', 'bg-purple-400'];
  const index = Math.abs(hash % colors.length);
  return colors[index];
};

export default function SessionPanel({ currentSessionId, onSessionSelect, onNewSession, refreshTrigger, availableAgents, onSessionDelete }: SessionPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAgentDropdown, setShowAgentDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(384);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, [refreshTrigger]);
  
  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!panelRef.current) return;
    
    const startWidth = panelRef.current.offsetWidth;
    const startX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      const minWidth = 256; // Corresponds to w-64
      const maxWidth = 800; // A reasonable max width
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl(API_CONFIG.ENDPOINTS.SESSIONS), {
        credentials: 'include',
      });
      if (handleUnauthorized(response)) return;
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  function handleUnauthorized(res: Response) {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }
  
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent session selection when clicking delete
    
    if (window.confirm('Are you sure you want to delete this session?')) {
      try {
        // Use path parameter correctly for DELETE request
        const deleteUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELETE_SESSION}/${sessionId}`;
        console.log('Sending delete request to:', deleteUrl);
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          credentials: 'include',
        });
        
        if (handleUnauthorized(response)) return;
        
        if (response.ok) {
          // Reload sessions to update the list
          loadSessions();
          
          // If the deleted session was the current one, clear it
          if (sessionId === currentSessionId && onSessionDelete) {
            onSessionDelete(sessionId);
          }
        } else {
          console.error('Failed to delete session:', response.statusText);
        }
      } catch (error) {
        console.error('Error deleting session:', error);
      }
    }
  };

  return (
    <div 
      ref={panelRef}
      style={{ width: `${width}px` }}
      className="bg-[#1a1a1a] text-white h-full flex flex-col border-r border-[#2a2a2a] relative"
    >
      {/* New Chat Button and Agent Selection - Fixed at top */}
      <div className="p-4 flex-shrink-0">
        {/* New Chat Button with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowAgentDropdown(prev => !prev)}
            className="w-full px-4 py-2.5 bg-[#2a2a2a] hover:bg-[#333333] rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center space-x-2 border border-[#3a3a3a]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>NEW CHAT</span>
            
            {/* Down arrow icon */}
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Agent Dropdown Menu */}
          {showAgentDropdown && (
            <div className="absolute left-0 right-0 mt-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
              {availableAgents?.map((agent) => (
                <button
                  key={agent}
                  onClick={() => {
                    onNewSession(agent);
                    setShowAgentDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-[#333333] transition-colors duration-150 flex items-center"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-400 mr-2"></div>
                  {agent}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sessions Section - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sessions</h3>
          
          {isLoading ? (
            <div className="text-center text-gray-500 py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500 mx-auto"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">
              No conversations yet
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 group relative ${
                    session.id === currentSessionId
                      ? 'bg-[#2a2a2a] text-white'
                      : 'hover:bg-[#252525] text-gray-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {/* Session selection area (covers most of the div) */}
                    <div 
                      className="flex items-center space-x-2 flex-1 cursor-pointer"
                      onClick={() => onSessionSelect(session.id)}
                    >
                      {/* Colored dot indicator */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getColorForSession(session.id)}`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {session.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDate(session.last_message_at)}
                        </div>
                      </div>
                    </div>
                    
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete session"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-20 group"
      >
        <div className="w-full h-full group-hover:bg-blue-500/30 transition-colors duration-200" />
      </div>
    </div>
  );
} 