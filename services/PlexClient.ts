
import { MediaClient } from './MediaClient';
import { EmbyItem, EmbyLibrary, FeedType, ServerConfig, VideoResponse, OrientationMode } from '../types';

export class PlexClient extends MediaClient {
    
    private getCleanUrl() {
        return this.config.url.replace(/\/$/, "");
    }

    private getHeaders() {
        return {
            'Accept': 'application/json',
            'X-Plex-Token': this.config.token
        };
    }

    private async getMachineIdentifier(): Promise<string> {
        if (this.config.userId && this.config.userId !== '1') return this.config.userId;
        try {
            const response = await fetch(`${this.getCleanUrl()}/identity`, { headers: this.getHeaders() });
            if (response.ok) {
                const data = await response.json();
                return data.MediaContainer.machineIdentifier || data.MediaContainer.MachineIdentifier || '1';
            }
        } catch (e) {}
        return '1';
    }

    async authenticate(username: string, password: string): Promise<ServerConfig> {
        const token = password; 
        const response = await fetch(`${this.getCleanUrl()}/identity`, {
            headers: { 'Accept': 'application/json', 'X-Plex-Token': token }
        });
        if (!response.ok) throw new Error('Plex Connection Failed');
        const data = await response.json();
        const machineIdentifier = data.MediaContainer.machineIdentifier || data.MediaContainer.MachineIdentifier;
        return { url: this.config.url, username: username || 'Plex User', userId: machineIdentifier || '1', token: token, serverType: 'plex' };
    }

    async getLibraries(): Promise<EmbyLibrary[]> {
        const response = await fetch(`${this.getCleanUrl()}/library/sections`, { headers: this.getHeaders() });
        const data = await response.json();
        return data.MediaContainer.Directory.map((d: any) => ({ 
            Id: d.key, 
            Name: d.title, 
            CollectionType: d.type 
        }));
    }

    private filterItems(items: EmbyItem[], mode: OrientationMode): EmbyItem[] {
        if (mode === 'both') return items;
        return items.filter(item => {
            const type = (item.Type || '').toLowerCase();
            const isNavFolder = ['show', 'season', 'folder'].includes(type);
            if (isNavFolder) return true;

            const w = item.Width || 0;
            const h = item.Height || 0;
            if (w === 0) return true; 
            if (mode === 'vertical') return h >= w * 0.8; 
            return w > h;
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
            const playlist = await this.findPlaylist(libraryName);
            if (!playlist) return { items: [], nextStartIndex: 0, totalCount: 0 };
            const response = await fetch(`${this.getCleanUrl()}/playlists/${playlist.ratingKey}/items?X-Plex-Container-Start=0&X-Plex-Container-Size=2000`, { headers: this.getHeaders() });
            const data = await response.json();
            const mappedItems = this.mapPlexItems(data.MediaContainer.Metadata || []);
            const filtered = this.filterItems(mappedItems, orientationMode);
            const reversed = filtered.reverse();
            return { items: reversed.slice(skip, skip + limit), nextStartIndex: skip + limit, totalCount: reversed.length };
        }

        let url = '';
        const isLibraryRoot = navParentId === undefined || (library && navParentId === library.Id);

        if (!isLibraryRoot && navParentId) {
            url = `${this.getCleanUrl()}/library/metadata/${navParentId}/children?X-Plex-Container-Start=${skip}&X-Plex-Container-Size=${limit}`;
        } else {
            const sectionId = navParentId || library?.Id;
            if (!sectionId) return { items: [], nextStartIndex: 0, totalCount: 0 };
            
            let sort = 'addedAt:desc';
            if (feedType === 'random') sort = 'random';
            url = `${this.getCleanUrl()}/library/sections/${sectionId}/all?sort=${sort}&X-Plex-Container-Start=${skip}&X-Plex-Container-Size=${limit}`;
        }

        const response = await fetch(url, { headers: this.getHeaders() });
        const data = await response.json();
        const items = data.MediaContainer.Metadata || [];
        const mappedItems = this.mapPlexItems(items);
        const filtered = this.filterItems(mappedItems, orientationMode);
        
        return { 
            items: filtered, 
            nextStartIndex: skip + items.length, 
            totalCount: data.MediaContainer.totalSize || data.MediaContainer.size || 0 
        };
    }

    private mapPlexItems(items: any[]): EmbyItem[] {
        return items.map((p: any) => {
             const media = p.Media?.[0];
             let formattedName = p.title;
             
             if (p.type === 'episode') {
                 const idx = p.index !== undefined ? String(p.index).padStart(2, '0') : '--';
                 formattedName = `${idx}. ${p.title}`;
             }

             return { 
                Id: p.ratingKey, 
                Name: formattedName, 
                Type: p.type, 
                MediaType: 'Video', 
                Overview: p.summary, 
                ProductionYear: p.year, 
                Width: media?.width, 
                Height: media?.height, 
                RunTimeTicks: p.duration ? p.duration * 10000 : undefined, 
                ImageTags: { Primary: p.thumb ? 'true' : undefined }, 
                UserData: {
                    IsFavorite: false,
                    PlayCount: p.viewCount || 0,
                    Played: (p.viewCount || 0) > 0,
                    PlaybackPositionTicks: p.viewOffset ? p.viewOffset * 10000 : 0,
                    LastPlayedDate: p.lastViewedAt ? new Date(p.lastViewedAt * 1000).toISOString() : undefined
                },
                _PlexThumb: p.thumb, 
                _PlexKey: media?.Part?.[0]?.key 
             };
        });
    }

    getVideoUrl(item: EmbyItem): string {
        const plexItem = item as any;
        if (plexItem._PlexKey) return `${this.getCleanUrl()}${plexItem._PlexKey}?X-Plex-Token=${this.config.token}`;
        return `${this.getCleanUrl()}/video/:/transcode/universal/start?path=${encodeURIComponent('/library/metadata/' + item.Id)}&mediaIndex=0&partIndex=0&protocol=hls&offset=0&fastSeek=1&directPlay=0&directStream=1&subtitleSize=100&audioBoost=100&X-Plex-Token=${this.config.token}`;
    }

    getImageUrl(itemId: string, tag?: string, type?: 'Primary' | 'Backdrop'): string {
        return `${this.getCleanUrl()}/photo/:/transcode?url=${encodeURIComponent(`/library/metadata/${itemId}/thumb`)}&width=800&height=1200&X-Plex-Token=${this.config.token}`;
    }

    private async findPlaylist(libraryName: string): Promise<any | null> {
        const title = `Tok-${libraryName}`;
        try {
            const response = await fetch(`${this.getCleanUrl()}/playlists?title=${encodeURIComponent(title)}`, { headers: this.getHeaders() });
            const data = await response.json();
            return data.MediaContainer.Metadata?.find((p: any) => p.title === title) || null;
        } catch (e) { return null; }
    }

    async getFavorites(libraryName: string): Promise<Set<string>> {
        const playlist = await this.findPlaylist(libraryName);
        if (!playlist) return new Set();
        try {
            const response = await fetch(`${this.getCleanUrl()}/playlists/${playlist.ratingKey}/items?X-Plex-Container-Size=2000`, { headers: this.getHeaders() });
            const data = await response.json();
            return new Set((data.MediaContainer.Metadata || []).map((i: any) => i.ratingKey));
        } catch (e) { return new Set(); }
    }

    async toggleFavorite(itemId: string, isFavorite: boolean, libraryName: string): Promise<void> {
        const playlist = await this.findPlaylist(libraryName);
        const machineId = await this.getMachineIdentifier();
        const itemUri = `server://${machineId}/com.plexapp.plugins.library/library/metadata/${itemId}`;
        if (isFavorite) {
            if (!playlist) return;
            const itemsRes = await fetch(`${this.getCleanUrl()}/playlists/${playlist.ratingKey}/items?X-Plex-Container-Size=2000`, { headers: this.getHeaders() });
            const entry = (await itemsRes.json()).MediaContainer.Metadata?.find((i: any) => i.ratingKey === itemId);
            if (entry?.playlistItemID) {
                await fetch(`${this.getCleanUrl()}/playlists/${playlist.ratingKey}/items/${entry.playlistItemID}?X-Plex-Token=${this.config.token}`, { method: 'DELETE', headers: this.getHeaders() });
            }
        } else {
            if (playlist) {
                await fetch(`${this.getCleanUrl()}/playlists/${playlist.ratingKey}/items?uri=${encodeURIComponent(itemUri)}&X-Plex-Token=${this.config.token}`, { method: 'PUT', headers: this.getHeaders() });
            } else {
                await fetch(`${this.getCleanUrl()}/playlists?type=video&title=${encodeURIComponent(`Tok-${libraryName}`)}&smart=0&uri=${encodeURIComponent(itemUri)}&X-Plex-Token=${this.config.token}`, { method: 'POST', headers: this.getHeaders() });
            }
        }
    }
}
