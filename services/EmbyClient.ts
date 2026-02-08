
import { MediaClient } from './MediaClient';
import { EmbyItem, EmbyLibrary, FeedType, ServerConfig, VideoResponse, OrientationMode } from '../types';

export class EmbyClient extends MediaClient {
    
    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-Emby-Authorization': `MediaBrowser Client="EmbyTok Web", Device="Web Browser", DeviceId="embytok-web-emby", Version="1.0.0", Token="${this.config.token}"`,
            'X-Emby-Token': this.config.token,
            'X-MediaBrowser-Token': this.config.token
        };
    }

    private getCleanUrl() {
        return this.config.url.replace(/\/$/, "");
    }

    async authenticate(username: string, password: string): Promise<ServerConfig> {
        const response = await fetch(`${this.getCleanUrl()}/Users/AuthenticateByName`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ Username: username, Pw: password }),
        });
        if (!response.ok) throw new Error('Emby Authentication failed');
        const data = await response.json();
        return { url: this.config.url, username: data.User.Name, userId: data.User.Id, token: data.AccessToken, serverType: 'emby' };
    }

    async getLibraries(): Promise<EmbyLibrary[]> {
        const response = await fetch(`${this.getCleanUrl()}/Users/${this.config.userId}/Views`, { headers: this.getHeaders() });
        const data = await response.json();
        return data.Items || [];
    }

    private formatItemName(item: any): string {
        if (item.Type === 'Episode') {
            const index = item.IndexNumber !== undefined ? String(item.IndexNumber).padStart(2, '0') : '--';
            const season = item.ParentIndexNumber !== undefined ? `S${String(item.ParentIndexNumber).padStart(2, '0')}` : '';
            return `${season}E${index}. ${item.Name}`;
        }
        return item.Name || '未命名';
    }

    private applyOrientationFilter(items: any[], mode: OrientationMode): any[] {
        if (mode === 'both') return items;
        return items.filter(item => {
            const isNavFolder = ['Series', 'Season', 'Folder', 'CollectionFolder', 'BoxSet'].includes(item.Type);
            if (isNavFolder) return true;
            
            const w = item.Width || 0;
            const h = item.Height || 0;
            if (w === 0 || h === 0) return true; 

            if (mode === 'vertical') return h >= w * 0.8;
            if (mode === 'horizontal') return w > h;
            return true;
        });
    }

    async getVideos(
        navParentId: string | undefined, 
        library: EmbyLibrary | null, 
        feedType: FeedType, 
        skip: number, 
        limit: number, 
        orientationMode: OrientationMode
    ): Promise<VideoResponse> {
        
        const libraryName = library ? library.Name : "收藏";

        if (feedType === 'favorites') {
            const playlistItems = await this.getTokPlaylistItemsInternal(libraryName);
            const filtered = this.applyOrientationFilter(playlistItems, orientationMode);
            const paged = filtered.reverse().slice(skip, skip + limit);
            return { items: paged, nextStartIndex: skip + limit, totalCount: filtered.length };
        }

        const params = new URLSearchParams({
            Fields: 'MediaSources,Width,Height,Overview,UserData,SeriesName,ParentIndexNumber,IndexNumber,Type',
            Limit: (limit * 2).toString(), 
            StartIndex: skip.toString(),
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            _t: Date.now().toString()
        });

        if (navParentId) {
            // 当进入特定文件夹时，显示其下的所有内容（包括子文件夹）
            params.append('ParentId', navParentId);
            params.append('Recursive', 'false');
            params.append('SortBy', 'SortName');
            params.append('IncludeItemTypes', 'Movie,Video,Episode,Folder,BoxSet,Series,Season');
        } else {
            // 当在媒体库根目录时
            if (library) {
                params.append('ParentId', library.Id);
                const collectionType = (library.CollectionType || '').toLowerCase();
                
                if (collectionType === 'tvshows' || collectionType === 'show') {
                    // 电视剧库：仅显示系列
                    params.append('IncludeItemTypes', 'Series');
                } else if (collectionType === 'folders') {
                    // 文件夹库：保留原始结构
                    params.append('IncludeItemTypes', 'Movie,Video,Episode,Folder,BoxSet');
                } else {
                    // 电影或其他媒体库：仅显示视频内容，不显示目录
                    params.append('IncludeItemTypes', 'Movie,Video,Episode');
                }
            } else {
                params.append('IncludeItemTypes', 'Movie,Video,Episode');
            }
            params.append('Recursive', 'true');
            params.append('SortBy', feedType === 'random' ? 'Random' : 'DateCreated');
            params.append('SortOrder', 'Descending');
        }

        const response = await fetch(`${this.getCleanUrl()}/Users/${this.config.userId}/Items?${params.toString()}`, { headers: this.getHeaders() });
        const data = await response.json();
        
        const rawItems = data.Items || [];
        const filteredItems = this.applyOrientationFilter(rawItems, orientationMode);
        
        const items = filteredItems.slice(0, limit).map((item: any) => ({
            ...item,
            Name: this.formatItemName(item),
            UserData: item.UserData ? {
                ...item.UserData,
                Played: item.UserData.Played || false,
                PlaybackPositionTicks: item.UserData.PlaybackPositionTicks || 0,
                LastPlayedDate: item.UserData.LastPlayedDate
            } : undefined
        }));

        return {
            items,
            nextStartIndex: skip + rawItems.length,
            totalCount: data.TotalRecordCount || 0
        };
    }

    getVideoUrl(item: EmbyItem): string {
        return `${this.getCleanUrl()}/Videos/${item.Id}/stream.mp4?Static=true&api_key=${this.config.token}`;
    }

    getImageUrl(itemId: string, tag?: string, type: 'Primary' | 'Backdrop' = 'Primary'): string {
        if (!tag) return '';
        return `${this.getCleanUrl()}/Items/${itemId}/Images/${type}?maxWidth=800&tag=${tag}&quality=90`;
    }

    private async getTokPlaylistId(libraryName: string): Promise<string> {
        const playlistName = `Tok-${libraryName}`;
        const searchRes = await fetch(`${this.getCleanUrl()}/Users/${this.config.userId}/Items?IncludeItemTypes=Playlist&Recursive=true`, { headers: this.getHeaders() });
        const searchData = await searchRes.json();
        const existing = searchData.Items?.find((i: any) => i.Name === playlistName);
        if (existing) return existing.Id;
        const createRes = await fetch(`${this.getCleanUrl()}/Playlists?Name=${playlistName}&UserId=${this.config.userId}`, { method: 'POST', headers: this.getHeaders() });
        const createData = await createRes.json();
        return createData.Id;
    }

    private async getTokPlaylistItemsInternal(libraryName: string): Promise<EmbyItem[]> {
        try {
            const pid = await this.getTokPlaylistId(libraryName);
            const response = await fetch(`${this.getCleanUrl()}/Playlists/${pid}/Items?UserId=${this.config.userId}&Fields=MediaSources,Width,Height,Overview,UserData`, { headers: this.getHeaders() });
            const data = await response.json();
            return data.Items || [];
        } catch (e) { return []; }
    }

    async getFavorites(libraryName: string): Promise<Set<string>> {
        const items = await this.getTokPlaylistItemsInternal(libraryName);
        return new Set(items.map(i => i.Id));
    }

    async toggleFavorite(itemId: string, isFavorite: boolean, libraryName: string): Promise<void> {
        const pid = await this.getTokPlaylistId(libraryName);
        if (!isFavorite) {
             await fetch(`${this.getCleanUrl()}/Playlists/${pid}/Items?Ids=${itemId}&UserId=${this.config.userId}`, { method: 'POST', headers: this.getHeaders() });
        } else {
            const itemsRes = await fetch(`${this.getCleanUrl()}/Playlists/${pid}/Items?UserId=${this.config.userId}`, { headers: this.getHeaders() });
            const entry = (await itemsRes.json()).Items.find((i: any) => i.Id === itemId);
            if (entry?.PlaylistItemId) {
                await fetch(`${this.getCleanUrl()}/Playlists/${pid}/Items?EntryIds=${entry.PlaylistItemId}`, { method: 'DELETE', headers: this.getHeaders() });
            }
        }
    }
}
