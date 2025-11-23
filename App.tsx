import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import VideoFeed from './components/VideoFeed';
import LibrarySelect from './components/LibrarySelect';
import { ServerConfig, EmbyLibrary, EmbyItem, FeedType } from './types';
import { getLibraries, getVerticalVideos } from './services/embyService';
import { Menu } from 'lucide-react';

function App() {
  const [config, setConfig] = useState<ServerConfig | null>(() => {
    const saved = localStorage.getItem('embyConfig');
    return saved ? JSON.parse(saved) : null;
  });

  const [libraries, setLibraries] = useState<EmbyLibrary[]>([]);
  const [selectedLib, setSelectedLib] = useState<EmbyLibrary | null>(null);
  const [videos, setVideos] = useState<EmbyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Feed State
  const [feedType, setFeedType] = useState<FeedType>('latest');

  useEffect(() => {
    if (config) {
      localStorage.setItem('embyConfig', JSON.stringify(config));
    } else {
      localStorage.removeItem('embyConfig');
    }
  }, [config]);

  useEffect(() => {
    if (config) {
      fetchLibraries();
      fetchVideos(null, 'latest'); // Initial load
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const fetchLibraries = async () => {
    if (!config) return;
    try {
      const libs = await getLibraries(config.url, config.userId, config.token);
      setLibraries(libs);
    } catch (e) {
      console.error("Error fetching libs", e);
    }
  };

  const fetchVideos = async (libId: string | null, type: FeedType) => {
    if (!config) return;
    setLoading(true);
    setVideos([]); // Clear current videos to show loading state cleanly or keep them? Better to clear or show overlay.
    try {
      const vids = await getVerticalVideos(
          config.url, 
          config.userId, 
          config.token, 
          libId || undefined,
          type
      );
      setVideos(vids);
    } catch (e) {
      console.error("Error fetching videos", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLibrarySelect = (lib: EmbyLibrary | null) => {
    setSelectedLib(lib);
    // When changing library, reset to Latest usually, or keep current feed type?
    // Let's keep current feed type but refresh content.
    fetchVideos(lib ? lib.Id : null, feedType);
  };

  const handleFeedTypeChange = (type: FeedType) => {
      if (type === feedType) return;
      setFeedType(type);
      fetchVideos(selectedLib?.Id || null, type);
  };

  if (!config) {
    return <Login onLogin={setConfig} />;
  }

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden font-sans text-white">
      
      {/* TOP NAVIGATION BAR */}
      <div className="absolute top-0 left-0 right-0 z-40 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-4 pt-2">
        
        {/* Left: Hamburger / Library */}
        <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-2 text-white/80 hover:text-white transition-colors"
        >
             <Menu className="w-6 h-6 drop-shadow-md" />
        </button>

        {/* Center: Feed Tabs (TikTok Style) */}
        <div className="flex items-center gap-4 font-bold text-md drop-shadow-md">
             <button 
                onClick={() => handleFeedTypeChange('favorites')}
                className={`transition-colors ${feedType === 'favorites' ? 'text-white scale-105' : 'text-white/50 hover:text-white/80'}`}
             >
                 Favorites
             </button>
             <div className="w-[1px] h-3 bg-white/20"></div>
             <button 
                onClick={() => handleFeedTypeChange('random')}
                className={`transition-colors ${feedType === 'random' ? 'text-white scale-105' : 'text-white/50 hover:text-white/80'}`}
             >
                 Random
             </button>
             <div className="w-[1px] h-3 bg-white/20"></div>
             <button 
                onClick={() => handleFeedTypeChange('latest')}
                className={`transition-colors ${feedType === 'latest' ? 'text-white scale-105' : 'text-white/50 hover:text-white/80'}`}
             >
                 Latest
             </button>
        </div>
        
        {/* Right: Empty buffer to balance the Menu icon, or Search icon later */}
        <div className="w-10"></div>
      </div>

      {/* LIBRARY INDICATOR (Optional, subtle below nav) */}
      {selectedLib && (
          <div className="absolute top-16 left-0 right-0 z-30 flex justify-center pointer-events-none">
              <span className="bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-white/70 border border-white/10 uppercase tracking-widest">
                  Library: {selectedLib.Name}
              </span>
          </div>
      )}

      {/* MAIN CONTENT FEED */}
      <VideoFeed 
        videos={videos} 
        serverUrl={config.url} 
        token={config.token} 
        onRefresh={() => fetchVideos(selectedLib?.Id || null, feedType)}
        isLoading={loading}
      />

      {/* LIBRARY DRAWER */}
      <LibrarySelect 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)}
        libraries={libraries}
        selectedId={selectedLib?.Id || null}
        onSelect={handleLibrarySelect}
      />
    </div>
  );
}

export default App;
