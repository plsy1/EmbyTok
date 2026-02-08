import React, { useState, useEffect, useMemo } from "react";
import Login from "./components/Login";
import VideoFeed from "./components/VideoFeed";
import VideoGrid from "./components/VideoGrid";
import LibrarySelect from "./components/LibrarySelect";
import { ServerConfig, EmbyLibrary, EmbyItem, FeedType, OrientationMode } from "./types";
import { ClientFactory } from "./services/clientFactory";
import { Menu, LayoutGrid, Smartphone, Volume2, VolumeX, Maximize, Minimize, ChevronLeft } from "lucide-react";

type ViewMode = "feed" | "grid";
const PAGE_SIZE = 15;

interface NavItem {
  id: string;
  title: string;
}

function App() {
  const [config, setConfig] = useState<ServerConfig | null>(() => {
    const saved = localStorage.getItem("embyConfig");
    return saved ? JSON.parse(saved) : null;
  });

  const client = useMemo(() => {
    return config ? ClientFactory.create(config) : null;
  }, [config]);

  const [libraries, setLibraries] = useState<EmbyLibrary[]>([]);
  const [selectedLib, setSelectedLib] = useState<EmbyLibrary | null>(null);

  // 内容状态
  const [videos, setVideos] = useState<EmbyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [serverStartIndex, setServerStartIndex] = useState(0);

  // 导航层级状态 (使用栈结构支持多级回退)
  const [navStack, setNavStack] = useState<NavItem[]>([]);

  // UI 状态
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [feedType, setFeedType] = useState<FeedType>("latest");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);

  const [orientationMode, setOrientationMode] = useState<OrientationMode>(() => {
    const saved = localStorage.getItem("embyOrientationMode");
    return (saved as OrientationMode) || "vertical";
  });

  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const [hiddenLibIds, setHiddenLibIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("embyHiddenLibs");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (config) localStorage.setItem("embyConfig", JSON.stringify(config));
    else localStorage.removeItem("embyConfig");
  }, [config]);

  useEffect(() => {
    if (client) fetchLibraries();
  }, [client]);

  const fetchLibraries = async () => {
    if (!client) return;
    try {
      setLibraries(await client.getLibraries());
    } catch (e) {}
  };

  const currentParentId = useMemo(() => {
    return navStack.length > 0 ? navStack[navStack.length - 1].id : undefined;
  }, [navStack]);

  const currentTitle = useMemo(() => {
    return navStack.length > 0 ? navStack[navStack.length - 1].title : "";
  }, [navStack]);

  const loadVideos = async (reset: boolean = false, overrideParentId?: string) => {
    if (!client || loading) return;
    setLoading(true);
    const currentSkip = reset ? 0 : serverStartIndex;
    const effectiveParentId = overrideParentId !== undefined ? overrideParentId : currentParentId;

    if (reset) {
      setVideos([]);
      setCurrentIndex(0);
      setHasMore(true);
      setServerStartIndex(0);
    }

    const libName = selectedLib ? selectedLib.Name : "收藏";
    try {
      if (reset) setFavoriteIds(await client.getFavorites(libName));

      const {
        items: newVideos,
        nextStartIndex,
        totalCount,
      } = await client.getVideos(effectiveParentId, selectedLib, feedType, currentSkip, PAGE_SIZE, orientationMode);

      setVideos((prev) => (reset ? newVideos : [...prev, ...newVideos]));
      setServerStartIndex(nextStartIndex);
      setHasMore(nextStartIndex < totalCount);

      if (reset && effectiveParentId && newVideos.length > 0) {
        const firstItem = newVideos[0];
        const type = (firstItem.Type || "").toLowerCase();
        const isFolder = ["series", "season", "folder", "boxset", "show"].includes(type);
        if (isFolder && viewMode === "feed") {
          setViewMode("grid");
        }
      }
    } catch (e) {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (id: string, title: string) => {
    setNavStack((prev) => [...prev, { id, title }]);
    setViewMode("grid");
  };

  const handleGoBack = () => {
    setNavStack((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    if (client) loadVideos(true);
  }, [navStack, client]);

  useEffect(() => {
    setNavStack([]);
    if (selectedLib) {
      const type = (selectedLib.CollectionType || "").toLowerCase();
      if (type === "tvshows" || type === "show") setViewMode("grid");
    }
    if (navStack.length === 0 && client) loadVideos(true);
  }, [feedType, selectedLib]);

  const handleToggleFavorite = async (itemId: string, isCurrentlyFavorite: boolean) => {
    if (!client) return;
    const libName = selectedLib ? selectedLib.Name : "收藏";
    try {
      await client.toggleFavorite(itemId, isCurrentlyFavorite, libName);
      setFavoriteIds((prev) => {
        const newSet = new Set(prev);
        if (isCurrentlyFavorite) newSet.delete(itemId);
        else newSet.add(itemId);
        return newSet;
      });
    } catch (e) {}
  };

  const handleLogout = () => {
    setConfig(null);
    localStorage.removeItem("embyConfig");
    setVideos([]);
    setIsMenuOpen(false);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  if (!config || !client) return <Login onLogin={setConfig} />;

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden font-sans text-white">
      {/* 统一响应式顶部导航栏 */}
      <div
        className={`absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between px-4 transition-opacity duration-300 ${isAutoPlay ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)",
          height: "calc(4rem + env(safe-area-inset-top))",
        }}>
        <div className="min-w-[44px] shrink-0 flex items-center">
          {navStack.length > 0 ? (
            <button onClick={handleGoBack} className="p-2 text-white/80 hover:text-white transition-colors">
              <ChevronLeft className="w-[clamp(20px,5.5vw,24px)] h-[clamp(20px,5.5vw,24px)]" />
            </button>
          ) : (
            <button onClick={() => setIsMenuOpen(true)} className="p-2 text-white/80 hover:text-white transition-colors">
              <Menu className="w-[clamp(20px,5.5vw,24px)] h-[clamp(20px,5.5vw,24px)]" />
            </button>
          )}
        </div>

        <div className="flex-1 flex justify-center items-center overflow-hidden mx-1">
          {navStack.length > 0 ? (
            <h2 className="font-bold truncate whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-300 text-[clamp(13px,4vw,15px)] max-w-[min(200px,55vw)] text-center">
              {currentTitle}
            </h2>
          ) : (
            <div className="flex items-center font-bold flex-nowrap whitespace-nowrap gap-[clamp(12px,4.5vw,20px)] text-[clamp(13px,4vw,15.5px)]">
              {["favorites", "random", "latest"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFeedType(t as FeedType)}
                  className={`transition-all duration-300 relative py-1 ${feedType === t ? "text-white" : "text-white/40 hover:text-white/60"}`}>
                  {t === "favorites" ? "收藏" : t === "random" ? "随机" : "最新"}
                  {feedType === t && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 justify-end min-w-[90px]">
          {/* 全屏按钮：移除 hidden sm:block，确保全端显示 */}
          <button onClick={toggleFullScreen} className="p-2 text-white/80 hover:text-white transition-colors">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-white/80 hover:text-white transition-colors">
            {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button onClick={() => setViewMode(viewMode === "feed" ? "grid" : "feed")} className="p-2 text-white/80 hover:text-white transition-colors">
            {viewMode === "feed" ? <LayoutGrid className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="w-full h-full bg-black">
        {viewMode === "grid" ? (
          <VideoGrid
            videos={videos}
            client={client}
            isLoading={loading}
            feedType={feedType}
            hasMore={hasMore}
            onSelect={(idx) => {
              setCurrentIndex(idx);
              setViewMode("feed");
            }}
            onLoadMore={() => loadVideos(false)}
            onRefresh={() => loadVideos(true)}
            currentIndex={currentIndex}
            onNavigate={handleNavigate}
            currentParentId={currentParentId}
          />
        ) : (
          <VideoFeed
            videos={videos}
            client={client}
            onRefresh={() => loadVideos(true)}
            isLoading={loading}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
            initialIndex={currentIndex}
            onIndexChange={setCurrentIndex}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(!isMuted)}
            feedType={feedType}
            hasMore={hasMore}
            onLoadMore={() => loadVideos(false)}
            isAutoPlay={isAutoPlay}
            onToggleAutoPlay={() => setIsAutoPlay(!isAutoPlay)}
          />
        )}
      </div>

      <LibrarySelect
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        libraries={libraries}
        selectedId={selectedLib?.Id || null}
        onSelect={setSelectedLib}
        hiddenLibIds={hiddenLibIds}
        onToggleHidden={(id) => {
          const newSet = new Set(hiddenLibIds);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          setHiddenLibIds(newSet);
          localStorage.setItem("embyHiddenLibs", JSON.stringify(Array.from(newSet)));
        }}
        onLogout={handleLogout}
        serverUrl={config.url}
        username={config.username}
        orientationMode={orientationMode}
        onOrientationChange={setOrientationMode}
      />
    </div>
  );
}

export default App;
