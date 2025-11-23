import React, { useState, useRef, useEffect } from 'react';
import { EmbyItem } from '../types';
import VideoCard from './VideoCard';
import { RefreshCw, Film } from 'lucide-react';

interface VideoFeedProps {
  videos: EmbyItem[];
  serverUrl: string;
  token: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ videos, serverUrl, token, onRefresh, isLoading }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Intersection Observer to detect which video is currently in view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const options = {
      root: container,
      rootMargin: '0px',
      threshold: 0.6, // Video is considered "active" when 60% visible
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = Number(entry.target.getAttribute('data-index'));
          setActiveIndex(index);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, options);

    const elements = container.querySelectorAll('.video-card-container');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [videos]);

  // Empty State
  if (videos.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white bg-black">
        <Film className="w-16 h-16 text-zinc-800 mb-4" />
        <p className="text-lg mb-2 font-bold">No videos found</p>
        <p className="text-zinc-500 text-sm mb-6 px-8 text-center">Try changing the filter or selecting a different library.</p>
        <button 
            onClick={onRefresh}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-full text-sm font-bold transition-colors"
        >
            <RefreshCw className="w-4 h-4" /> Reload
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar bg-black"
    >
      {videos.map((item, index) => (
        <div
          key={item.Id}
          data-index={index}
          className="video-card-container h-[100dvh] w-full snap-center relative"
        >
          {/* Render active, previous, and next videos */}
          {Math.abs(activeIndex - index) <= 1 ? (
            <VideoCard
              item={item}
              config={{ url: serverUrl, token, username: '', userId: '' }} // Pass config object constructed here for simplicity
              isActive={activeIndex === index}
            />
          ) : (
            // Placeholder for off-screen videos
            <div className="w-full h-full bg-black" />
          )}
        </div>
      ))}
      
      {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
              <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
          </div>
      )}
    </div>
  );
};

export default VideoFeed;
