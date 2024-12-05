from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters

from config import BOT_TOKEN
from .handlers.command_handlers import (
    start_command,
    help_command,
    search_command,
    playlist_command
)
from .handlers.message_handlers import handle_message, handle_callback
from .database.models import init_db

def create_application() -> Application:
    """Create and configure the bot application."""
    # Initialize database
    init_db()
    
    # Create application
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add command handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("search", search_command))
    application.add_handler(CommandHandler("playlist", playlist_command))
    
    # Add message handlers
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Add callback query handler
    application.add_handler(CallbackQueryHandler(handle_callback))
    
    return application 