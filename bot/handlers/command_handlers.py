from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import ContextTypes
from telegram.error import TelegramError
from typing import List, Dict

from bot.database.operations import DatabaseManager
from services.music_download import MusicDownloader
from config import MAX_PLAYLIST_SIZE

db = DatabaseManager()
downloader = MusicDownloader()

# Define commands and their descriptions
COMMANDS = {
    'start': 'Start the bot and show main menu',
    'help': 'Show all available commands',
    'search': 'Search for music to download',
    'playlist': 'Manage your playlists',
    'queue': 'View your download queue'
}

def create_main_menu() -> InlineKeyboardMarkup:
    """Create the main menu keyboard."""
    # Your deployed Netlify URL
    WEBAPP_URL = "https://lightboltwebapp.netlify.app"
    
    keyboard = [
        [InlineKeyboardButton("🎵 Open Music Player", web_app={"url": WEBAPP_URL})],
        [InlineKeyboardButton("🔍 Search Music", callback_data="search")],
        [InlineKeyboardButton("📱 My Playlists", callback_data="playlists")]
    ]
    return InlineKeyboardMarkup(keyboard)

async def setup_commands(application) -> None:
    """Set up the bot commands in Telegram."""
    commands = [BotCommand(command, description) for command, description in COMMANDS.items()]
    await application.bot.set_my_commands(commands)

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /start command."""
    # Clean up previous messages
    if 'last_bot_messages' in context.user_data:
        for msg in context.user_data['last_bot_messages']:
            try:
                await msg.delete()
            except:
                pass
    
    msg = await update.message.reply_text(
        "⚡ *Welcome to LightBolt!*\n\n"
        "Your personal music companion. Here's what you can do:\n\n"
        "• Click the Music Player button to open the web player\n"
        "• Use /search to find and download music\n"
        "• Use /playlist to manage your playlists\n"
        "• Use /help to see all commands\n",
        reply_markup=create_main_menu(),
        parse_mode='Markdown'
    )
    
    # Store message for cleanup
    context.user_data['last_bot_messages'] = [msg]

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /help command."""
    help_text = "*Available Commands:*\n\n"
    for command, description in COMMANDS.items():
        help_text += f"/{command} - {description}\n"
    
    help_text += "\n*How to use:*\n"
    help_text += "1. Start with /search to find music\n"
    help_text += "2. Create playlists with /playlist\n"
    help_text += "3. Check your queue with /queue\n"
    
    msg = await update.message.reply_text(
        help_text,
        parse_mode='Markdown'
    )
    
    if 'last_bot_messages' in context.user_data:
        try:
            for old_msg in context.user_data['last_bot_messages']:
                await old_msg.delete()
        except:
            pass
    context.user_data['last_bot_messages'] = [msg]

async def playlist_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /playlist command."""
    user_id = update.effective_user.id
    playlists = db.get_user_playlists(user_id)
    
    if not playlists:
        msg = await update.message.reply_text(
            "*📱 My Playlists*\n\n"
            "You don't have any playlists yet.\n\n"
            "To create a playlist:\n"
            "1. Search for a song using /search\n"
            "2. Select the song\n"
            "3. Choose 'Add to Playlist'\n"
            "4. Create a new playlist",
            parse_mode='Markdown'
        )
    else:
        playlist_text = "*📱 My Playlists*\n\n"
        for playlist in playlists:
            song_count = db.get_playlist_song_count(playlist['id'])
            playlist_text += f"• {playlist['name']} ({song_count} songs)\n"
        
        playlist_text += "\nSelect a playlist to view its songs"
        
        keyboard = []
        for playlist in playlists:
            keyboard.append([InlineKeyboardButton(
                f"{playlist['name']} ({db.get_playlist_song_count(playlist['id'])} songs)",
                callback_data=f"view_playlist_{playlist['id']}"
            )])
        
        msg = await update.message.reply_text(
            playlist_text,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
    
    if 'last_bot_messages' in context.user_data:
        try:
            for old_msg in context.user_data['last_bot_messages']:
                await old_msg.delete()
        except:
            pass
    context.user_data['last_bot_messages'] = [msg]

async def search_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /search command."""
    msg = await update.message.reply_text(
        "*🔍 Music Search*\n\n"
        "Send me a song name or artist...\n\n"
        "Examples:\n"
        "• Shape of You\n"
        "• Ed Sheeran\n"
        "• Blinding Lights - The Weeknd",
        parse_mode='Markdown'
    )
    
    if 'last_bot_messages' in context.user_data:
        try:
            for old_msg in context.user_data['last_bot_messages']:
                await old_msg.delete()
        except:
            pass
    context.user_data['last_bot_messages'] = [msg]
    context.user_data['expecting_search'] = True

async def queue_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /queue command."""
    user_id = update.effective_user.id
    queue = db.get_user_queue(user_id)
    
    if not queue:
        msg = await update.message.reply_text(
            "*⏳ Download Queue*\n\n"
            "Your queue is empty.\n\n"
            "To add songs to queue:\n"
            "1. Use /search to find music\n"
            "2. Select a song\n"
            "3. Choose 'Download'",
            parse_mode='Markdown'
        )
    else:
        queue_text = "*⏳ Download Queue*\n\n"
        for i, item in enumerate(queue, 1):
            status = "⏳" if item['status'] == 'pending' else "✅"
            queue_text += f"{i}. {status} {item['song_name']}\n"
        
        msg = await update.message.reply_text(
            queue_text,
            parse_mode='Markdown'
        )
    
    if 'last_bot_messages' in context.user_data:
        try:
            for old_msg in context.user_data['last_bot_messages']:
                await old_msg.delete()
        except:
            pass
    context.user_data['last_bot_messages'] = [msg] 