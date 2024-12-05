// Telegram WebApp initialization
const tg = window.Telegram.WebApp;

// Initialize the WebApp
class TelegramApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.initApp();
    }

    initApp() {
        // Enable closing confirmation
        this.tg.enableClosingConfirmation();

        // Set header color
        this.tg.setHeaderColor('secondary_bg_color');

        // Set background color
        this.tg.setBackgroundColor('bg_color');

        // Expand WebApp to full height
        this.tg.expand();

        // Initialize theme
        this.initTheme();

        // Add event listeners
        this.addEventListeners();
    }

    initTheme() {
        // Get color scheme
        const colorScheme = this.tg.colorScheme;
        document.documentElement.setAttribute('data-theme', colorScheme);

        // Apply theme variables
        const themeParams = this.tg.themeParams;
        if (themeParams) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color);
            document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color);
            document.documentElement.style.setProperty('--tg-theme-hint-color', themeParams.hint_color);
            document.documentElement.style.setProperty('--tg-theme-link-color', themeParams.link_color);
            document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color);
            document.documentElement.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color);
        }
    }

    addEventListeners() {
        // Handle back button
        this.tg.BackButton.onClick(() => {
            // Handle navigation back
            const event = new CustomEvent('tg:back');
            document.dispatchEvent(event);
        });

        // Handle main button
        this.tg.MainButton.onClick(() => {
            // Handle main button click
            const event = new CustomEvent('tg:mainButton');
            document.dispatchEvent(event);
        });

        // Handle theme change
        this.tg.onEvent('themeChanged', () => {
            this.initTheme();
        });
    }

    // User data methods
    getUserData() {
        return this.tg.initDataUnsafe?.user || null;
    }

    // Navigation methods
    showBackButton() {
        this.tg.BackButton.show();
    }

    hideBackButton() {
        this.tg.BackButton.hide();
    }

    // Main button methods
    showMainButton(text, color = null) {
        this.tg.MainButton.text = text;
        if (color) {
            this.tg.MainButton.color = color;
        }
        this.tg.MainButton.show();
    }

    hideMainButton() {
        this.tg.MainButton.hide();
    }

    // HapticFeedback methods
    impactOccurred(style = 'medium') {
        this.tg.HapticFeedback.impactOccurred(style);
    }

    notificationOccurred(type = 'success') {
        this.tg.HapticFeedback.notificationOccurred(type);
    }

    // Cloud storage methods
    async getCloudStorage(key) {
        try {
            return await this.tg.CloudStorage.getItem(key);
        } catch (error) {
            console.error('Cloud storage error:', error);
            return null;
        }
    }

    async setCloudStorage(key, value) {
        try {
            await this.tg.CloudStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error('Cloud storage error:', error);
            return false;
        }
    }

    // Send data to bot
    sendData(data) {
        this.tg.sendData(JSON.stringify(data));
    }

    // Ready event
    ready() {
        this.tg.ready();
    }
}

// Create and export Telegram app instance
const telegramApp = new TelegramApp();
export default telegramApp;

// Handle errors
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ', msg, '\nURL: ', url, '\nLine: ', lineNo, '\nColumn: ', columnNo, '\nError object: ', error);
    
    // Send error to bot if in production
    if (process.env.NODE_ENV === 'production') {
        telegramApp.sendData({
            type: 'error',
            error: {
                message: msg,
                url: url,
                line: lineNo,
                column: columnNo,
                stack: error?.stack
            }
        });
    }
    
    return false;
};

// Handle unhandled promise rejections
window.onunhandledrejection = function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Send error to bot if in production
    if (process.env.NODE_ENV === 'production') {
        telegramApp.sendData({
            type: 'error',
            error: {
                message: 'Unhandled Promise Rejection',
                reason: event.reason?.message || event.reason,
                stack: event.reason?.stack
            }
        });
    }
};
