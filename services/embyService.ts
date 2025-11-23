import { EmbyAuthResponse, EmbyItem, EmbyLibrary, FeedType } from '../types';

const CLIENT_NAME = "EmbyTok Web";
const CLIENT_VERSION = "1.0.0";
const DEVICE_NAME = "Web Browser";
const DEVICE_ID = "embytok-web-client-id-" + Math.random().toString(36).substring(7);

const getHeaders = (token?: string) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Emby-Authorization': `MediaBrowser Client="${CLIENT_NAME}", Device="${DEVICE_NAME}", DeviceId="${DEVICE_ID}", Version="${CLIENT_VERSION}"${token ? `, Token="${token}"` : ''}`,
  };
  return headers;
};

export const authenticate = async (serverUrl: string, username: string, password: string): Promise<EmbyAuthResponse> => {
  const cleanUrl = serverUrl.replace(/\/$/, "");
  const response = await fetch(`${cleanUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      Username: username,
      Pw: password,
    }),
  });

  if (!response.ok) {
    throw new Error('Authentication failed');
  }

  return response.json();
};

export const getLibraries = async (serverUrl: string, userId: string, token: string): Promise<EmbyLibrary[]> => {
  const cleanUrl = serverUrl.replace(/\/$/, "");
  const response = await fetch(`${cleanUrl}/Users/${userId}/Views`, {
    headers: getHeaders(token),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch libraries');
  }

  const data = await response.json();
  return data.Items || [];
};

export const getVerticalVideos = async (
  serverUrl: string, 
  userId: string, 
  token: string, 
  parentId?: string,
  feedType: FeedType = 'latest'
): Promise<EmbyItem[]> => {
  const cleanUrl = serverUrl.replace(/\/$/, "");
  
  const params = new URLSearchParams({
    IncludeItemTypes: 'Movie,Video,Episode',
    Recursive: 'true',
    Fields: 'MediaSources,Width,Height,Overview,UserData', // Added UserData
    Limit: '100', 
    ImageTypeLimit: '1',
    EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
  });

  // Configure Sort and Filters based on FeedType
  if (feedType === 'random') {
    params.append('SortBy', 'Random');
  } else {
    // Default to latest
    params.append('SortBy', 'DateCreated');
    params.append('SortOrder', 'Descending');
  }

  if (feedType === 'favorites') {
    params.append('Filters', 'IsFavorite');
  }

  if (parentId) {
    params.append('ParentId', parentId);
  }

  const response = await fetch(`${cleanUrl}/Users/${userId}/Items?${params.toString()}`, {
    headers: getHeaders(token),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch videos');
  }

  const data = await response.json();
  const items: EmbyItem[] = data.Items || [];

  // Filter for vertical(ish) videos
  return items.filter(item => {
    const w = item.Width || 0;
    const h = item.Height || 0;
    // Allow slightly horizontal (square-ish) but prefer vertical
    return h >= w * 0.8 && w > 0; 
  });
};

export const toggleFavorite = async (serverUrl: string, userId: string, itemId: string, isFavorite: boolean, token: string): Promise<void> => {
    const cleanUrl = serverUrl.replace(/\/$/, "");
    const endpoint = isFavorite 
        ? `${cleanUrl}/Users/${userId}/FavoriteItems/${itemId}`
        : `${cleanUrl}/Users/${userId}/FavoriteItems/${itemId}/Delete`; // Emby API difference for un-favoriting might vary, but typically DELETE or POST to delete endpoint
    
    // Emby Standard API: POST to FavoriteItems/{Id} to favorite, DELETE to FavoriteItems/{Id} to unfavorite
    const method = isFavorite ? 'POST' : 'DELETE';

    await fetch(endpoint, {
        method: method,
        headers: getHeaders(token)
    });
};

export const getVideoUrl = (serverUrl: string, itemId: string, token: string): string => {
  const cleanUrl = serverUrl.replace(/\/$/, "");
  return `${cleanUrl}/Videos/${itemId}/stream.mp4?Static=true&api_key=${token}`;
};

export const getImageUrl = (serverUrl: string, itemId: string, tag: string | undefined, type: 'Primary' | 'Backdrop' = 'Primary'): string => {
    if (!tag) return '';
    const cleanUrl = serverUrl.replace(/\/$/, "");
    return `${cleanUrl}/Items/${itemId}/Images/${type}?maxWidth=800&tag=${tag}&quality=90`;
};
