
import React, { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { EmbyItem, FeedType } from '../types';
import { MediaClient } from '../services/MediaClient';
import { PlayCircle, Clock, RefreshCw, Shuffle, Layers, Folder as FolderIcon, History } from 'lucide-react';

interface VideoGridProps {
  videos: EmbyItem[];
  client: MediaClient;
  onSelect: (index: number) => void;
  isLoading?: boolean;
  feedType: FeedType;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  currentIndex?: number;
  onNavigate?: (id: string, title: string) => void;
  currentParentId?: string;
}

const VideoGrid: React.FC<VideoGridProps> = ({ 
    videos, 
    client, 
    onSelect, 
    isLoading,
    feedType,
    hasMore,
    onLoadMore,
    onRefresh,
    currentIndex = 0,
    onNavigate,
    currentParentId
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const formatTime = (ticks?: number) => {
    if (!ticks) return '';
    const minutes = Math.round(ticks / 10000000 / 60);
    return `${minutes}m`;
  };

  // 核心逻辑：找出应该续播的集数
  useEffect(() => {
      if (videos.length > 0 && !isLoading) {
          // 查找“正在观看中”的集数 (优先级 1)
          let targetIndex = videos.findIndex(v => (v.UserData?.PlaybackPositionTicks || 0) > 0);
          
          // 如果没有观看中的，查找“最后播放”的集数 (优先级 2)
          if (targetIndex === -1) {
              let latestDate = 0;
              videos.forEach((v, idx) => {
                  if (v.UserData?.LastPlayedDate) {
                      const d = new Date(v.UserData.LastPlayedDate).getTime();
                      if (d > latestDate) {
                          latestDate = d;
                          targetIndex = idx;
                      }
                  }
              });
          }

          if (targetIndex !== -1) {
              setHighlightedIndex(targetIndex);
              // 自动滚动到该集数
              setTimeout(() => {
                  const element = document.getElementById(`grid-item-${targetIndex}`);
                  if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
              }, 300);
          }
      }
  }, [videos, isLoading]);

  useLayoutEffect(() => {
    if (currentIndex > 0 && videos.length > 0) {
        const element = document.getElementById(`grid-item-${currentIndex}`);
        if (element) {
            element.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && feedType === 'latest') {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (scrollContainerRef.current) {
        const loadMoreTrigger = scrollContainerRef.current.querySelector('#load-more-trigger');
        if (loadMoreTrigger) observer.observe(loadMoreTrigger);
    }
    return () => observer.disconnect();
  }, [hasMore, isLoading, feedType, onLoadMore]);

  const handleItemClick = (item: EmbyItem, index: number) => {
      const isNavFolder = ['Series', 'Season', 'Folder', 'CollectionFolder', 'BoxSet', 'show', 'season'].includes(item.Type);
      
      if (isNavFolder && onNavigate) {
          onNavigate(item.Id, item.Name);
      } else {
          onSelect(index);
      }
  };

  if (videos.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 pt-20">
        <p className="mb-4">暂无内容</p>
        <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-full text-sm hover:bg-zinc-700">
            <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="w-full h-full overflow-y-auto bg-black p-2 pb-24 no-scrollbar">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-16">
        {videos.map((item, index) => {
          const posterSrc = item.ImageTags?.Primary
            ? client.getImageUrl(item.Id, item.ImageTags.Primary, 'Primary')
            : undefined;
          
          const isFolder = ['Series', 'Season', 'Folder', 'CollectionFolder', 'BoxSet', 'show', 'season'].includes(item.Type);
          const isHighlighted = highlightedIndex === index;
          
          // 计算播放进度百分比
          const progress = (item.UserData?.PlaybackPositionTicks && item.RunTimeTicks) 
            ? Math.min(Math.round((item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100), 100) 
            : 0;

          return (
            <div 
              key={item.Id}
              id={`grid-item-${index}`}
              onClick={() => handleItemClick(item, index)}
              className={`relative aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden cursor-pointer transition-all group active:scale-95 z-10 
                ${index === currentIndex ? 'ring-2 ring-white/50' : ''} 
                ${isHighlighted ? 'ring-2 ring-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]' : ''}`}
            >
              {posterSrc ? (
                <img src={posterSrc} alt={item.Name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                    {isFolder ? <FolderIcon className="w-8 h-8 opacity-50" /> : <PlayCircle className="w-8 h-8 opacity-50" />}
                    <span className="text-[10px] uppercase font-bold tracking-widest">{item.Type}</span>
                </div>
              )}

              {/* 徽章提示：上次播放 / 观看中 */}
              {isHighlighted && !isFolder && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg animate-pulse">
                      <History className="w-3 h-3" />
                      <span>{progress > 0 ? '正在观看' : '上次观看'}</span>
                  </div>
              )}

              {/* 播放进度条 */}
              {progress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }}></div>
                  </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-70" />

              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {isFolder ? <Layers className="w-10 h-10 text-white/80" /> : <PlayCircle className="w-10 h-10 text-white/80" />}
              </div>

              {isFolder && (
                <div className="absolute top-2 right-2 bg-indigo-600/90 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight shadow-lg border border-white/20">
                    {['Series', 'show'].includes(item.Type) ? '剧集' : ['Season', 'season'].includes(item.Type) ? '季度' : '目录'}
                </div>
              )}

              <div className={`absolute bottom-0 left-0 right-0 p-2 ${progress > 0 ? 'pb-3' : ''}`}>
                 <h3 className="text-white text-xs font-bold line-clamp-2 drop-shadow-md mb-0.5">
                    {item.Name}
                 </h3>
                 <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                    {item.RunTimeTicks && !isFolder && (
                        <>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(item.RunTimeTicks)}</span>
                        </>
                    )}
                    {item.ProductionYear && isFolder && (
                        <span className="text-zinc-500">{item.ProductionYear}</span>
                    )}
                 </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div id="load-more-trigger" className="w-full py-8 flex flex-col items-center justify-center text-zinc-500 gap-4">
          {isLoading && <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />}
          {!isLoading && feedType === 'random' && (
              <button onClick={onRefresh} className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white text-sm font-bold active:scale-95">
                 <Shuffle className="w-4 h-4" /> 换一批
              </button>
          )}
          {!isLoading && feedType === 'latest' && !hasMore && <span className="text-xs text-zinc-700">- 到底了 -</span>}
      </div>
    </div>
  );
};

export default VideoGrid;
