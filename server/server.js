const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');
const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 8000;

// CORS configuration
const corsOptions = {
    origin: [
        'https://lightboltwebapp.netlify.app',
        'http://localhost:3000',
        'http://localhost:8000'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Data paths
const PLAYLISTS_FILE = path.join(__dirname, 'data', 'playlists.json');
const CACHE_DIR = path.join(__dirname, 'cache');

// Ensure cache directory exists
async function ensureCacheDir() {
    try {
        await fs.access(CACHE_DIR);
    } catch {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    }
}

// Initialize playlists file if it doesn't exist
async function initializePlaylists() {
    try {
        await fs.access(PLAYLISTS_FILE);
    } catch {
        await fs.mkdir(path.dirname(PLAYLISTS_FILE), { recursive: true });
        await fs.writeFile(PLAYLISTS_FILE, JSON.stringify([], null, 2));
    }
}

// Initialize server
async function initializeServer() {
    try {
        await ensureCacheDir();
        await initializePlaylists();
        console.log('Server initialized successfully');
    } catch (error) {
        console.error('Error initializing server:', error);
    }
}

// Load playlists from file
async function loadPlaylists() {
    try {
        const data = await fs.readFile(PLAYLISTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading playlists:', error);
        return [];
    }
}

// Save playlists to file
async function savePlaylists(playlists) {
    try {
        await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
    } catch (error) {
        console.error('Error saving playlists:', error);
        throw error;
    }
}

// Search YouTube using yt-dlp
async function searchYouTube(query) {
    try {
        const command = `yt-dlp ytsearch10:"${query}" -j --flat-playlist`;
        const { stdout } = await execAsync(command);
        const results = stdout.trim().split('\n').map(line => {
            const data = JSON.parse(line);
            return {
                id: data.id,
                title: data.title,
                artist: data.uploader || data.channel,
                duration: data.duration,
                albumArt: data.thumbnail
            };
        });
        return results;
    } catch (error) {
        console.error('Error searching YouTube:', error);
        throw error;
    }
}

// Get stream URL using yt-dlp
async function getStreamUrl(videoId) {
    try {
        const cacheFile = path.join(CACHE_DIR, `${videoId}.json`);
        
        try {
            const cached = await fs.readFile(cacheFile, 'utf8');
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < 3600000) { // Cache for 1 hour
                return data;
            }
        } catch (err) {
            // Cache miss or expired
        }

        // Get available formats with properly escaped URL
        const videoUrl = `"https://youtube.com/watch?v=${videoId}"`;
        const formatsCommand = `yt-dlp ${videoUrl} -j --no-warnings`;
        const { stdout: formatsOutput } = await execAsync(formatsCommand);
        
        if (!formatsOutput.trim()) {
            throw new Error('No video data received from yt-dlp');
        }

        const videoData = JSON.parse(formatsOutput);
        
        // Find best audio format (prefer m4a/mp3 with reasonable quality)
        const audioFormats = videoData.formats.filter(f => 
            f.acodec !== 'none' && 
            f.vcodec === 'none' &&
            (f.ext === 'm4a' || f.ext === 'mp3' || f.ext === 'webm') &&
            f.abr < 160 // Limit bitrate for better streaming
        ).sort((a, b) => {
            // Prefer m4a/mp3 over webm
            if (a.ext !== b.ext) {
                if (a.ext === 'm4a') return -1;
                if (b.ext === 'm4a') return 1;
                if (a.ext === 'mp3') return -1;
                if (b.ext === 'mp3') return 1;
            }
            // Then sort by quality
            return b.abr - a.abr;
        });

        if (!audioFormats.length) {
            throw new Error('No suitable audio format found');
        }

        const bestFormat = audioFormats[0];
        const streamUrl = bestFormat.url;
        
        if (!streamUrl) {
            throw new Error('No stream URL found in the selected format');
        }

        // Ensure we have all required format properties
        const format = {
            ext: bestFormat.ext || 'mp3', // Default to mp3 if not specified
            abr: bestFormat.abr || 128,
            acodec: bestFormat.acodec || 'mp3',
            mime: `audio/${bestFormat.ext || 'mp3'}`
        };

        const result = {
            streamUrl,
            title: videoData.title || 'Unknown Title',
            artist: videoData.uploader || videoData.channel || 'Unknown Artist',
            duration: videoData.duration || 0,
            thumbnail: videoData.thumbnail || '',
            format,
            timestamp: Date.now()
        };

        // Cache the result
        await fs.writeFile(cacheFile, JSON.stringify(result));
        
        return result;
    } catch (error) {
        console.error('Error getting stream URL:', error);
        throw new Error(`Failed to get stream URL: ${error.message}`);
    }
}

// Stream proxy endpoint to handle CORS and format conversion
app.get('/api/proxy/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await getStreamUrl(id);
        
        if (!data || !data.streamUrl) {
            throw new Error('No stream URL found');
        }

        // Ensure format object exists and has required properties
        const format = data.format || {
            ext: 'mp3',
            mime: 'audio/mpeg',
            abr: 128,
            acodec: 'mp3'
        };

        // Map format extensions to proper MIME types
        const mimeTypes = {
            'mp3': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'webm': 'audio/webm',
            'ogg': 'audio/ogg'
        };

        // Set appropriate headers for streaming
        const mimeType = mimeTypes[format.ext] || 'audio/mpeg';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        // Get range header if present
        const range = req.headers.range;
        
        try {
            if (range) {
                // Handle range request
                const response = await fetch(data.streamUrl, {
                    headers: { 
                        Range: range,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36'
                    }
                });
                
                if (response.status === 206) {
                    res.status(206);
                    res.setHeader('Content-Range', response.headers.get('Content-Range'));
                    res.setHeader('Content-Length', response.headers.get('Content-Length'));
                }
                
                // Pipe the response
                response.body.pipe(res);
            } else {
                // Stream full content
                const response = await fetch(data.streamUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Stream fetch failed with status ${response.status}`);
                }

                if (response.headers.has('content-length')) {
                    res.setHeader('Content-Length', response.headers.get('content-length'));
                }
                
                response.body.pipe(res);
            }
        } catch (fetchError) {
            console.error('Error fetching stream:', fetchError);
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Stream fetch failed',
                    details: fetchError.message
                });
            }
        }
    } catch (error) {
        console.error('Error streaming audio:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Internal server error',
                details: error.message 
            });
        }
    }
});

// Get stream URL endpoint (now includes format info)
app.get('/api/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || typeof id !== 'string' || id.length < 5) {
            return res.status(400).json({
                error: 'Invalid video ID',
                details: 'Video ID must be a valid string'
            });
        }

        const data = await getStreamUrl(id);
        
        if (!data || !data.streamUrl) {
            return res.status(404).json({
                error: 'Stream not found',
                details: 'Could not get stream URL for the video'
            });
        }

        // Ensure format object exists
        const format = data.format || {
            ext: 'mp3',
            mime: 'audio/mp3',
            abr: 128,
            acodec: 'mp3'
        };

        // Return stream info with proxy URL
        res.json({
            ...data,
            streamUrl: `/api/proxy/stream/${id}`,
            format: {
                ...format,
                mime: format.mime || `audio/${format.ext || 'mp3'}`
            }
        });
    } catch (error) {
        console.error('Error getting stream URL:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message,
            videoId: req.params.id
        });
    }
});

// Search endpoint
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const results = await searchYouTube(query);
        res.json(results);
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error reporting endpoint
app.post('/api/error', (req, res) => {
    const { error } = req.body;
    console.error('Client error:', error);
    res.status(200).json({ message: 'Error logged' });
});

// Playlist endpoints
app.get('/api/playlists', async (req, res) => {
    try {
        const playlists = await loadPlaylists();
        res.json(playlists);
    } catch (error) {
        console.error('Error getting playlists:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists', async (req, res) => {
    try {
        const { name, description = '' } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const playlists = await loadPlaylists();
        const newPlaylist = {
            id: Date.now().toString(),
            name,
            description,
            songs: []
        };

        playlists.push(newPlaylist);
        await savePlaylists(playlists);

        res.status(201).json(newPlaylist);
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/playlists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const playlists = await loadPlaylists();
        const playlist = playlists.find(p => p.id === id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        res.json(playlist);
    } catch (error) {
        console.error('Error getting playlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/playlists/:id/songs', async (req, res) => {
    try {
        const { id } = req.params;
        const { songId } = req.body;

        if (!songId) {
            return res.status(400).json({ error: 'Song ID is required' });
        }

        const playlists = await loadPlaylists();
        const playlistIndex = playlists.findIndex(p => p.id === id);

        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        // Check if song already exists in playlist
        if (playlists[playlistIndex].songs.includes(songId)) {
            return res.status(400).json({ error: 'Song already in playlist' });
        }

        playlists[playlistIndex].songs.push(songId);
        await savePlaylists(playlists);

        res.json(playlists[playlistIndex]);
    } catch (error) {
        console.error('Error adding song to playlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/playlists/:playlistId/songs/:songId', async (req, res) => {
    try {
        const { playlistId, songId } = req.params;
        const playlists = await loadPlaylists();
        const playlistIndex = playlists.findIndex(p => p.id === playlistId);

        if (playlistIndex === -1) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const songIndex = playlists[playlistIndex].songs.indexOf(songId);
        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found in playlist' });
        }

        playlists[playlistIndex].songs.splice(songIndex, 1);
        await savePlaylists(playlists);

        res.json(playlists[playlistIndex]);
    } catch (error) {
        console.error('Error removing song from playlist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
initializeServer().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on port ${port}`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
});
