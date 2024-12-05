import telegramApp from './telegram.js';
import api from './api.js';
import player from './player.js';

class App {
    constructor() {
        this.currentView = 'search';
        this.searchResults = [];
        this.playlists = [];
        this.downloads = [];
        this.isLoading = false;
        
        // Initialize app
        this.initApp();
    }

    async initApp() {
        try {
            console.log('Initializing app...');
            
            // Initialize UI elements
            this.initElements();
            
            // Add event listeners
            this.addEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            // Mark app as ready
            telegramApp.ready();
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Error initializing app:', error);
            this.handleError(error);
        }
    }

    initElements() {
        console.log('Initializing elements...');
        
        // Search elements
        this.searchInput = document.getElementById('searchInput');
        this.searchButton = document.getElementById('searchButton');
        this.searchResultsContainer = document.getElementById('searchResults');
        
        // Navigation
        this.navButtons = document.querySelectorAll('.nav-button');
        
        if (!this.searchInput || !this.searchButton || !this.searchResultsContainer) {
            throw new Error('Required elements not found');
        }
    }

    addEventListeners() {
        console.log('Adding event listeners...');
        
        // Search events
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch();
            }
        });
        
        this.searchButton.addEventListener('click', () => {
            this.handleSearch();
        });
        
        // Navigation events
        this.navButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.switchView(button.dataset.view);
            });
        });
        
        // Telegram back button
        document.addEventListener('tg:back', () => {
            console.log('Back button pressed');
            if (this.currentView !== 'search') {
                this.switchView('search');
            }
        });
        
        // Add audio event listeners
        this.addAudioEventListeners();
        
        // Button events
        this.playButton.addEventListener('click', () => this.togglePlay());
        this.prevButton.addEventListener('click', () => this.playPrevious());
        this.nextButton.addEventListener('click', () => this.playNext());
        this.addToPlaylistButton.addEventListener('click', () => this.handleAddToPlaylist());
        
        // Progress bar events
        this.progressBar.parentElement.addEventListener('click', (e) => this.seek(e));
    }

    async loadInitialData() {
        try {
            console.log('Loading initial data...');
            
            // Load user preferences
            const preferences = await api.getPreferences();
            this.applyPreferences(preferences);
            
            // Load playlists
            const playlists = await api.getPlaylists();
            this.renderPlaylists(playlists);
            
            // Load downloads
            const downloads = await api.getDownloads();
            this.downloads = downloads;
            
            console.log('Initial data loaded successfully');
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.handleError(error);
        }
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        console.log('Handling search for query:', query);
        
        if (!query) {
            console.log('Empty search query, skipping');
            return;
        }
        
        try {
            this.setLoading(true);
            console.log('Starting search...');
            
            // Search for music
            const results = await api.searchMusic(query);
            console.log('Search results received:', results);
            
            // Render results
            this.renderSearchResults(results);
            
            // Switch to search view
            this.switchView('search');
            
            // Clear search input
            this.searchInput.value = '';
            
        } catch (error) {
            console.error('Search error:', error);
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }

    renderSearchResults(results) {
        console.log('Rendering search results:', results);
        
        // Clear previous results
        this.searchResultsContainer.innerHTML = '';
        
        if (!results || results.length === 0) {
            console.log('No results to display');
            this.searchResultsContainer.innerHTML = `
                <div class="no-results">
                    <p>No results found</p>
                </div>
            `;
            return;
        }
        
        // Create results container
        const resultsGrid = document.createElement('div');
        resultsGrid.className = 'results-grid';
        
        results.forEach((track) => {
            // Format duration
            const duration = track.duration ? this.formatDuration(track.duration) : '';
            
            // Create default thumbnail URL if none provided
            const thumbnailUrl = track.albumArt || `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
            
            const card = document.createElement('div');
            card.className = 'song-card';
            card.setAttribute('data-track-id', track.id);
            card.innerHTML = `
                <div class="song-card-inner">
                    <div class="song-card-image">
                        <img 
                            src="${thumbnailUrl}" 
                            alt="${this.escapeHtml(track.title)}" 
                            loading="lazy"
                            onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${track.id}/mqdefault.jpg';"
                        >
                        <div class="song-card-overlay">
                            <button class="play-button" aria-label="Play">
                                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="song-card-content">
                        <div>
                            <h3 class="song-title">${this.escapeHtml(track.title)}</h3>
                            <p class="song-artist">${this.escapeHtml(track.artist)}${duration ? ` • ${duration}` : ''}</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Add click event listener
            card.addEventListener('click', (e) => {
                console.log('Track card clicked:', track);
                e.stopPropagation();
                this.handleTrackSelect(track);
            });
            
            // Add to results grid
            resultsGrid.appendChild(card);
        });
        
        // Add results grid to container
        this.searchResultsContainer.appendChild(resultsGrid);
        console.log('Search results rendered successfully');
    }

    formatDuration(seconds) {
        if (!seconds) return '';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    renderPlaylists(playlists) {
        console.log('Rendering playlists:', playlists);
        
        this.playlistsContainer.innerHTML = '';
        
        if (!playlists || playlists.length === 0) {
            this.playlistsContainer.innerHTML = `
                <div class="no-playlists">
                    <p>No playlists yet</p>
                    <button class="create-playlist-button">Create Playlist</button>
                </div>
            `;
            return;
        }
        
        playlists.forEach(playlist => {
            const card = document.createElement('div');
            card.className = 'playlist-card';
            card.innerHTML = `
                <h3>${playlist.name}</h3>
                <p>${playlist.songCount} songs</p>
            `;
            
            card.addEventListener('click', () => this.handlePlaylistSelect(playlist));
            this.playlistsContainer.appendChild(card);
        });
    }

    async handleTrackSelect(track) {
        try {
            console.log('Handling track selection:', track);
            
            // Show loading state
            this.setLoading(true);
            
            // Load and play the track
            const success = await player.loadTrack(track);
            
            if (success) {
                // Start playing
                await player.togglePlay();
                
                // Show the player section
                document.getElementById('player').classList.remove('hidden');
                
                // Haptic feedback if available
                if (telegramApp.tg.HapticFeedback) {
                    telegramApp.tg.HapticFeedback.impactOccurred('light');
                }
            } else {
                throw new Error('Failed to load track');
            }
            
        } catch (error) {
            console.error('Error selecting track:', error);
            this.handleError(error);
        } finally {
            this.setLoading(false);
        }
    }

    showTrackOptions(track) {
        console.log('Showing track options:', track);
        
        // Store selected track for main button handler
        this.selectedTrack = track;
        
        // Show main button with proper styling
        const mainButton = telegramApp.tg.MainButton;
        mainButton.setText('Track Info');
        mainButton.show();
        
        // Handle main button click
        const handleMainButtonClick = () => {
            mainButton.hide();
            this.showTrackInfo(track);
        };
        
        mainButton.onClick(handleMainButtonClick);
        
        // Return cleanup function
        return () => {
            mainButton.offClick(handleMainButtonClick);
            mainButton.hide();
        };
    }

    showTrackInfo(track) {
        try {
            console.log('Showing info for track:', track);
            
            // Format duration
            const duration = track.duration ? this.formatDuration(track.duration) : 'Unknown duration';
            
            // Create info message
            const info = `🎵 ${track.title}\n👤 ${track.artist}\n⏱ ${duration}`;
            
            // Show popup with track info
            telegramApp.showPopup({
                title: 'Track Info',
                message: info,
                buttons: [{
                    id: 'add_to_playlist',
                    type: 'default',
                    text: 'Add to Playlist'
                }]
            });
            
            // Hide main button
            telegramApp.hideMainButton();
            
            // Provide haptic feedback
            telegramApp.impactOccurred('light');
            
        } catch (error) {
            console.error('Error showing track info:', error);
            this.handleError(error);
        }
    }

    switchView(view) {
        console.log('Switching to view:', view);
        
        // Update current view
        this.currentView = view;
        
        // Update navigation
        this.navButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.view === view);
        });
        
        // Show/hide sections
        document.querySelectorAll('section').forEach(section => {
            section.classList.toggle('hidden', !section.id.includes(view));
        });
        
        // Update back button
        if (view === 'search') {
            telegramApp.hideBackButton();
        } else {
            telegramApp.showBackButton();
        }
        
        // Hide main button when switching views
        telegramApp.hideMainButton();
    }

    setLoading(loading) {
        console.log('Setting loading state:', loading);
        this.isLoading = loading;
        document.body.classList.toggle('loading', loading);
    }

    handleError(error) {
        console.error('Handling error:', error);
        
        // Report error
        api.reportError(error);
        
        // Show error notification
        telegramApp.notificationOccurred('error');
        
        // Show error message
        const message = error.message || 'An error occurred';
        telegramApp.showMainButton(message, '#F44336');
        setTimeout(() => telegramApp.hideMainButton(), 3000);
    }

    applyPreferences(preferences) {
        console.log('Applying preferences:', preferences);
        
        // Apply theme
        document.documentElement.setAttribute('data-theme', preferences.theme || 'light');
        
        // Apply other preferences
        if (preferences.volume !== undefined) {
            player.setVolume(preferences.volume);
        }
    }

    async handleAddToPlaylist() {
        if (!this.currentTrack) return;

        try {
            // Get user's playlists
            const playlists = await api.getPlaylists();
            
            if (!playlists || playlists.length === 0) {
                // If no playlists exist, prompt to create one
                telegramApp.showPopup({
                    title: 'No Playlists',
                    message: 'You don\'t have any playlists yet. Would you like to create one?',
                    buttons: [{
                        id: 'create_playlist',
                        type: 'default',
                        text: 'Create Playlist'
                    }]
                });
                return;
            }

            // Show playlist selection popup
            const buttons = playlists.map(playlist => ({
                id: `playlist_${playlist.id}`,
                type: 'default',
                text: playlist.name
            }));

            telegramApp.showPopup({
                title: 'Add to Playlist',
                message: 'Choose a playlist to add the song:',
                buttons: buttons
            });

            // Handle playlist selection
            const handlePlaylistSelection = async (event) => {
                if (event.button_id && event.button_id.startsWith('playlist_')) {
                    const playlistId = event.button_id.replace('playlist_', '');
                    try {
                        await api.addToPlaylist(playlistId, this.currentTrack.id);
                        telegramApp.showAlert('Song added to playlist!');
                        telegramApp.impactOccurred('light');
                    } catch (error) {
                        console.error('Error adding to playlist:', error);
                        this.handleError(error);
                    }
                } else if (event.button_id === 'create_playlist') {
                    // Handle create playlist
                    this.switchView('playlists');
                }
            };

            document.addEventListener('tg:popupClosed', handlePlaylistSelection, { once: true });

        } catch (error) {
            console.error('Error handling add to playlist:', error);
            this.handleError(error);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app = new App();
});
