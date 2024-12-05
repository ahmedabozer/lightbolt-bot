import telegramApp from './telegram.js';
import api from './api.js';

class MusicPlayer {
    constructor() {
        // Create audio element and container
        this.audioContainer = document.createElement('div');
        this.audioContainer.id = 'audioContainer';
        this.audio = document.createElement('audio');
        this.audio.id = 'audioPlayer';
        this.audio.preload = 'auto';
        this.audioContainer.appendChild(this.audio);
        document.body.appendChild(this.audioContainer);
        
        this.currentTrack = null;
        this.queue = [];
        this.isPlaying = false;
        this.volume = 1;
        this.repeat = false;
        this.shuffle = false;
        
        // Initialize player elements
        this.initElements();
        // Add event listeners
        this.addEventListeners();
    }

    initElements() {
        // Player elements
        this.playerSection = document.getElementById('player');
        this.albumArt = document.getElementById('albumArt');
        this.trackTitle = document.getElementById('trackTitle');
        this.artistName = document.getElementById('artistName');
        this.progressBar = document.getElementById('progress');
        
        // Control buttons
        this.playButton = document.getElementById('playButton');
        this.prevButton = document.getElementById('prevButton');
        this.nextButton = document.getElementById('nextButton');
        this.addToPlaylistButton = document.getElementById('addToPlaylistButton');

        if (!this.playerSection || !this.albumArt || !this.trackTitle || 
            !this.artistName || !this.progressBar || !this.playButton || 
            !this.prevButton || !this.nextButton || !this.addToPlaylistButton) {
            console.error('Required player elements not found');
            return;
        }
    }

    addEventListeners() {
        // Add audio event listeners
        this.addAudioEventListeners();
        
        // Button events - bind methods to preserve 'this' context
        this.playButton.addEventListener('click', () => this.togglePlay());
        this.prevButton.addEventListener('click', () => this.playPrevious());
        this.nextButton.addEventListener('click', () => this.playNext());
        this.addToPlaylistButton.addEventListener('click', () => this.handleAddToPlaylist());

        // Progress bar events
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.addEventListener('click', (e) => this.seek(e));
        }
    }

    addAudioEventListeners() {
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.onTrackEnd());
        this.audio.addEventListener('error', (e) => {
            console.error('Audio error:', e.target.error);
            this.handleError(new Error(`Audio error: ${e.target.error?.message || 'Unknown error'}`));
        });
        this.audio.addEventListener('canplay', () => {
            console.log('Audio can play');
            this.onCanPlay();
        });
        this.audio.addEventListener('waiting', () => {
            console.log('Audio is waiting/buffering');
            this.setLoadingState(true);
        });
        this.audio.addEventListener('playing', () => {
            console.log('Audio is playing');
            this.setLoadingState(false);
        });
    }

    async loadTrack(track) {
        try {
            if (!track || !track.id) {
                console.warn('Invalid track data:', track);
                return false;
            }

            // Show loading state
            this.setLoadingState(true);
            
            console.log('Loading track:', track);
            
            // Get stream URL
            const streamData = await api.getStreamUrl(track.id);
            console.log('Got stream data:', streamData);
            
            if (!streamData || !streamData.streamUrl) {
                throw new Error('No stream URL received');
            }

            // Update current track info
            this.currentTrack = {
                id: track.id,
                title: streamData.title || track.title,
                artist: streamData.artist || track.artist,
                duration: streamData.duration || track.duration,
                albumArt: streamData.thumbnail || track.albumArt
            };
            
            // Update UI first
            this.updatePlayerUI();
            
            // Show player if hidden
            this.playerSection.classList.remove('hidden');
            
            // Stop current audio if playing
            if (this.isPlaying) {
                await this.audio.pause();
                this.isPlaying = false;
            }
            
            // Reset audio element
            this.audio.currentTime = 0;
            
            // Remove all existing sources
            while (this.audio.firstChild) {
                this.audio.removeChild(this.audio.firstChild);
            }

            // Create and add new source
            const source = document.createElement('source');
            const sourceUrl = new URL(streamData.streamUrl, window.location.origin);
            source.src = sourceUrl.toString();
            
            // Set proper MIME type
            const format = streamData.format || { ext: 'mp3' };
            const mimeTypes = {
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'webm': 'audio/webm',
                'ogg': 'audio/ogg'
            };
            source.type = mimeTypes[format.ext] || 'audio/mpeg';
            
            // Add source to audio element
            this.audio.appendChild(source);
            
            // Force reload
            await this.audio.load();
            console.log('Track loaded successfully');
            
            return true;
        } catch (error) {
            console.error('Error loading track:', error);
            this.handleError(error);
            return false;
        } finally {
            this.setLoadingState(false);
        }
    }

    updatePlayerUI() {
        if (!this.currentTrack) return;

        // Update track info
        this.albumArt.src = this.currentTrack.albumArt || 'img/default-album.png';
        this.trackTitle.textContent = this.currentTrack.title || 'Unknown Title';
        this.artistName.textContent = this.currentTrack.artist || 'Unknown Artist';

        // Update play button icon
        this.playButton.innerHTML = this.isPlaying ? 
            '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' : 
            '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

        // Show player section
        this.playerSection.classList.remove('hidden');
    }

    async togglePlay() {
        if (!this.currentTrack || !this.currentTrack.id) {
            console.warn('No valid track loaded');
            return;
        }
        
        try {
            console.log('Toggling play state:', { isPlaying: this.isPlaying, track: this.currentTrack });
            
            if (this.isPlaying) {
                await this.audio.pause();
                console.log('Track paused');
            } else {
                try {
                    await this.audio.play();
                    console.log('Started playing track');
                    if (telegramApp.tg.HapticFeedback) {
                        telegramApp.tg.HapticFeedback.impactOccurred('light');
                    }
                } catch (playError) {
                    console.error('Play error:', playError);
                    throw playError;
                }
            }
            
            this.isPlaying = !this.isPlaying;
            this.updatePlayerUI();
        } catch (error) {
            console.error('Error toggling play:', error);
            this.handleError(error);
        }
    }

    updateProgress() {
        if (!this.audio.duration) return;
        
        const progress = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressBar.style.width = `${progress}%`;
    }

    seek(event) {
        if (!this.audio.duration) return;
        
        const progressBar = event.currentTarget;
        const bounds = progressBar.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const width = bounds.width;
        const percentage = x / width;
        
        this.audio.currentTime = percentage * this.audio.duration;
    }

    setLoadingState(isLoading) {
        this.playerSection.classList.toggle('loading', isLoading);
    }

    handleError(error) {
        console.error('Player error:', error);
        api.reportError({
            type: 'player_error',
            message: error.message,
            track: this.currentTrack?.id
        });
    }

    onCanPlay() {
        this.setLoadingState(false);
    }

    onTrackEnd() {
        if (this.repeat) {
            this.audio.currentTime = 0;
            this.audio.play();
        } else {
            this.playNext();
        }
    }

    // Queue management
    setQueue(tracks, startIndex = 0) {
        this.queue = tracks;
        if (tracks.length > 0) {
            this.loadTrack(tracks[startIndex]);
        }
    }

    addToQueue(track) {
        this.queue.push(track);
        
        // If this is the first track, load it
        if (this.queue.length === 1) {
            this.loadTrack(track);
        }
    }

    clearQueue() {
        this.queue = [];
        this.currentTrack = null;
        this.audio.src = '';
        this.playerSection.classList.add('hidden');
    }

    async handleAddToPlaylist() {
        try {
            // Check if we have a valid current track
            if (!this.currentTrack || !this.currentTrack.id) {
                console.warn('No valid track to add to playlist');
                return;
            }

            // Use MainButton for adding to favorites
            const mainButton = telegramApp.tg.MainButton;
            
            // Set up the button
            mainButton.setText('Add to Favorites');
            mainButton.show();
            
            // Handle click
            const handleClick = async () => {
                try {
                    // Hide button while processing
                    mainButton.hide();
                    
                    // Add to favorites
                    await api.addToFavorites(this.currentTrack);
                    
                    // Update UI
                    this.addToPlaylistButton.classList.add('active');
                    setTimeout(() => {
                        this.addToPlaylistButton.classList.remove('active');
                    }, 1000);
                } catch (error) {
                    console.error('Error adding to favorites:', error);
                    this.addToPlaylistButton.classList.add('error');
                    setTimeout(() => {
                        this.addToPlaylistButton.classList.remove('error');
                    }, 1000);
                } finally {
                    // Clean up
                    mainButton.offClick(handleClick);
                    mainButton.hide();
                }
            };

            // Add click handler
            mainButton.onClick(handleClick);
            
            // Return cleanup function
            return () => {
                mainButton.offClick(handleClick);
                mainButton.hide();
            };
        } catch (error) {
            console.error('Error handling add to playlist:', error);
        }
    }
}

// Create and export a single instance
const player = new MusicPlayer();
export default player;
