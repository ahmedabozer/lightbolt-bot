import telegramApp from './telegram.js';

class API {
    constructor() {
        // Use environment variable or fallback to localhost for development
        this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        console.log('API initialized with base URL:', this.baseUrl);
        this.initData = telegramApp.tg.initData;
        
        // Set to false to use real API
        this.useMockData = false;
    }

    // Helper method for making API requests
    async request(endpoint, options = {}) {
        try {
            if (this.useMockData) {
                return await this.getMockData(endpoint, options);
            }

            console.log('Making API request:', { endpoint, options });
            
            const url = `${this.baseUrl}${endpoint}`;
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.initData}`,
                    'X-Telegram-Init-Data': this.initData
                }
            };

            const response = await fetch(url, { ...defaultOptions, ...options });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('API response:', data);
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Search for music
    async searchMusic(query, limit = 10) {
        console.log('Initiating search request:', { query, limit });
        const response = await this.request('/api/search', {
            method: 'POST',
            body: JSON.stringify({
                query,
                limit
            })
        });
        console.log('Search response received:', response);
        return response;
    }

    // Get song stream URL
    async getStreamUrl(songId) {
        console.log('Getting stream URL for song:', songId);
        try {
            const response = await this.request(`/api/stream/${songId}`);
            console.log('Stream response:', response);
            
            if (!response || !response.streamUrl) {
                throw new Error('Invalid stream response: missing streamUrl');
            }
            
            return response;
        } catch (error) {
            console.error('Error getting stream URL:', error);
            throw new Error(`Failed to get stream URL: ${error.message}`);
        }
    }

    // Download song
    async downloadSong(songId) {
        return this.request(`/api/download/${songId}`, {
            method: 'POST'
        });
    }

    // Get download status
    async getDownloadStatus(downloadId) {
        return this.request(`/api/download/${downloadId}/status`);
    }

    // Get user's downloads
    async getDownloads() {
        return this.request('/api/downloads');
    }

    // Get user's playlists
    async getPlaylists() {
        return this.request('/api/playlists');
    }

    // Create a new playlist
    async createPlaylist(name, description = '') {
        return this.request('/api/playlists', {
            method: 'POST',
            body: JSON.stringify({
                name,
                description
            })
        });
    }

    // Add song to playlist
    async addToPlaylist(playlistId, songId) {
        return this.request(`/api/playlists/${playlistId}/songs`, {
            method: 'POST',
            body: JSON.stringify({
                songId
            })
        });
    }

    // Remove song from playlist
    async removeFromPlaylist(playlistId, songId) {
        return this.request(`/api/playlists/${playlistId}/songs/${songId}`, {
            method: 'DELETE'
        });
    }

    // Get playlist details
    async getPlaylistDetails(playlistId) {
        return this.request(`/api/playlists/${playlistId}`);
    }

    // Get user preferences
    async getPreferences() {
        return this.request('/api/preferences');
    }

    // Update user preferences
    async updatePreferences(preferences) {
        return this.request('/api/preferences', {
            method: 'PUT',
            body: JSON.stringify(preferences)
        });
    }

    // Report an error
    async reportError(error) {
        // Prevent error reporting loops
        if (error.isReported) {
            console.error('Error already reported:', error);
            return;
        }

        try {
            console.error('Reporting error to server:', error);
            error.isReported = true;
            
            // Only report if it's not an API error (to prevent loops)
            if (!error.message?.includes('API Error')) {
                await this.request('/api/error', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    })
                });
            }
        } catch (reportError) {
            // Just log locally if reporting fails
            console.error('Failed to report error:', reportError);
        }
    }
}

// Create and export API instance
const api = new API();
export default api;
