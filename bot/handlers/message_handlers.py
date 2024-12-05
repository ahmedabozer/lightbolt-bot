from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from telegram.error import TelegramError
import asyncio

from bot.database.operations import DatabaseManager
from services.music_download import MusicDownloader
from .command_handlers import create_main_menu

db = DatabaseManager()
downloader = MusicDownloader()

async def delete_message_with_delay(message, delay: int = 2):
    """Delete message after delay."""
    await asyncio.sleep(delay)
    try:
        await message.delete()
    except Exception:
        pass

def create_search_results_keyboard(results):
    """Create keyboard for search results."""
    keyboard = []
    for i, track in enumerate(results[:5]):  # Limit to 5 results
        duration = f"{track['duration'] // 60}:{track['duration'] % 60:02d}"
        keyboard.append([
            InlineKeyboardButton(
                f"🎵 {track['title']} ({duration})",
                callback_data=f"download_{i}"
            )
        ])
    keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="main_menu")])
    return InlineKeyboardMarkup(keyboard)

def create_main_menu():
    """Create the main menu keyboard."""
    keyboard = [
        [InlineKeyboardButton("🔍 Search Music", callback_data="search")],
        [InlineKeyboardButton("📁 My Playlist", callback_data="playlist")]
    ]
    return InlineKeyboardMarkup(keyboard)

async def cleanup_messages(context):
    """Clean up old messages before sending new ones."""
    # Clean up previous audio message if it exists
    if 'last_audio_message' in context.user_data:
        try:
            await context.user_data['last_audio_message'].delete()
        except Exception as e:
            if "Message to delete not found" not in str(e):
                print(f"Error deleting audio message: {e}")
        finally:
            del context.user_data['last_audio_message']
    
    # Clean up previous bot messages
    if 'last_bot_messages' in context.user_data:
        for msg in context.user_data['last_bot_messages']:
            try:
                await msg.delete()
            except Exception as e:
                if "Message to delete not found" not in str(e):
                    print(f"Error deleting message: {e}")
        context.user_data['last_bot_messages'] = []
    
    # Clean up user's last message
    if 'last_user_message' in context.user_data:
        try:
            await context.user_data['last_user_message'].delete()
        except Exception as e:
            if "Message to delete not found" not in str(e):
                print(f"Error deleting user message: {e}")
        finally:
            del context.user_data['last_user_message']

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle text messages."""
    message = update.message
    user_id = message.from_user.id
    text = message.text

    # Handle search query
    if text.startswith('/'):
        return  # Ignore commands

    # Immediately delete user's message
    try:
        await message.delete()
    except:
        pass
        
    # Store the search query in context
    context.user_data['search_query'] = text
    
    # Edit the existing bot message
    if 'last_bot_message' in context.user_data:
        try:
            # Update to searching status
            await context.user_data['last_bot_message'].edit_text(
                "⚡ *Searching...*\n"
                "───────────────────",
                parse_mode='Markdown'
            )
            
            # Search for tracks
            results = await downloader.search_music(text)
            if not results:
                await context.user_data['last_bot_message'].edit_text(
                    "❌ *No Results*\n\n"
                    "Try a different search term.\n"
                    "───────────────────",
                    reply_markup=create_main_menu(),
                    parse_mode='Markdown'
                )
                return
                
            # Store results in context
            context.user_data['search_results'] = results
            
            # Create keyboard with results
            keyboard = []
            for i, track in enumerate(results[:5]):  # Limit to 5 results
                duration = f"{track['duration'] // 60}:{track['duration'] % 60:02d}"
                keyboard.append([
                    InlineKeyboardButton(
                        f"🎵 {track['title']} ({duration})",
                        callback_data=f"download_{i}"
                    )
                ])
            
            keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="main_menu")])
            
            # Show results by editing the bot message
            await context.user_data['last_bot_message'].edit_text(
                "⚡ *Search Results*\n\n"
                "Select a song to download:\n"
                "───────────────────",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode='Markdown'
            )
            
        except Exception as e:
            print(f"Error searching: {e}")
            await context.user_data['last_bot_message'].edit_text(
                "❌ *Error*\n\n"
                "Search failed. Please try again.\n"
                "───────────────────",
                reply_markup=create_main_menu(),
                parse_mode='Markdown'
            )
    else:
        # If somehow there's no bot message, redirect user to use /search command
        try:
            msg = await message.reply_text(
                "❌ Please use /search command first.",
                reply_markup=create_main_menu()
            )
            await msg.delete(30)  # Delete after 30 seconds
        except:
            pass

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle callback queries."""
    query = update.callback_query
    user_id = query.from_user.id
    
    try:
        # Clean up only audio message when navigating away
        if query.data in ["main_menu", "search", "playlist"] or query.data.startswith("view_playlist"):
            if 'last_audio_message' in context.user_data:
                try:
                    await context.user_data['last_audio_message'].delete()
                except Exception as e:
                    if "Message to delete not found" not in str(e):
                        print(f"Error deleting audio message: {e}")
                finally:
                    del context.user_data['last_audio_message']

        # Handle song deletion from playlist
        if query.data.startswith("p_del_"):
            try:
                _, _, song_id = query.data.split("_")
                if db.remove_song_from_playlist(user_id, int(song_id)):
                    # Show updated playlist
                    songs = db.get_playlist_songs(user_id)
                    
                    if not songs:
                        keyboard = [
                            [InlineKeyboardButton("��� Back", callback_data="main_menu")]
                        ]
                        await query.message.edit_text(
                            "⚡ *Empty Playlist*\n\n"
                            "Your playlist is empty.\n"
                            "───────────────────",
                            reply_markup=InlineKeyboardMarkup(keyboard),
                            parse_mode='Markdown'
                        )
                    else:
                        text = "⚡ *My Music*\n\n"
                        keyboard = []
                        
                        for i, song in enumerate(songs, 1):
                            duration = f"{song.duration // 60}:{song.duration % 60:02d}"
                            text += f"{i}. {song.title} - {song.artist} ({duration})\n"
                            keyboard.append([
                                InlineKeyboardButton(
                                    f"▶️ Play #{i}",
                                    callback_data=f"p_play_{song.song_id}"
                                ),
                                InlineKeyboardButton(
                                    "🗑️ Delete",
                                    callback_data=f"p_del_{song.song_id}"
                                )
                            ])
                        
                        text += "\n───────────────────"
                        keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="main_menu")])
                        
                        await query.message.edit_text(
                            text,
                            reply_markup=InlineKeyboardMarkup(keyboard),
                            parse_mode='Markdown'
                        )
                    await query.answer("✅ Song removed from playlist")
                else:
                    await query.answer("❌ Could not remove song", show_alert=True)
            except Exception as e:
                print(f"Error removing song from playlist: {e}")
                await query.answer("❌ Could not remove song", show_alert=True)
            return

        elif query.data.startswith("p_play_"):
            try:
                # Clean up previous audio before playing new one
                if 'last_audio_message' in context.user_data:
                    try:
                        await context.user_data['last_audio_message'].delete()
                    except Exception as e:
                        if "Message to delete not found" not in str(e):
                            print(f"Error deleting audio message: {e}")
                    finally:
                        del context.user_data['last_audio_message']
                
                song_id = query.data.split("_")[2]
                song = db.get_song_by_id(int(song_id))
                if song:
                    sent_message = await query.message.reply_audio(
                        audio=song.file_id,
                        title=song.title,
                        performer=song.artist,
                        duration=song.duration,
                        caption=f"⚡ *Now Playing:*\n{song.title} - {song.artist}",
                        parse_mode='Markdown'
                    )
                    context.user_data['last_audio_message'] = sent_message
                else:
                    await query.answer("❌ Song not found", show_alert=True)
            except Exception as e:
                print(f"Error playing song: {e}")
                await query.answer("❌ Could not play this song", show_alert=True)
            return

        elif query.data == "playlist":
            songs = db.get_playlist_songs(user_id)
            if not songs:
                keyboard = [
                    [InlineKeyboardButton("🔙 Back", callback_data="main_menu")]
                ]
                await query.message.edit_text(
                    "⚡ *Empty Playlist*\n\n"
                    "Your playlist is empty.\n"
                    "───────────────────",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            else:
                text = "⚡ *My Music*\n\n"
                keyboard = []
                
                for i, song in enumerate(songs, 1):
                    duration = f"{song.duration // 60}:{song.duration % 60:02d}"
                    text += f"{i}. {song.title} - {song.artist} ({duration})\n"
                    keyboard.append([
                        InlineKeyboardButton(
                            f"▶️ Play #{i}",
                            callback_data=f"p_play_{song.song_id}"
                        ),
                        InlineKeyboardButton(
                            "🗑️ Delete",
                            callback_data=f"p_del_{song.song_id}"
                        )
                    ])
                
                text += "\n───────────────"
                keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="main_menu")])
                
                await query.message.edit_text(
                    text,
                    reply_markup=InlineKeyboardMarkup(keyboard),
                    parse_mode='Markdown'
                )
            return

        elif query.data == "search":
            await query.message.edit_text(
                "🔍 *Search Music*\n\n"
                "Send me a song name or artist...\n\n"
                "_Example: \"Shape of You\" or \"Ed Sheeran\"_\n"
                "───────────────────",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("🔙 Back", callback_data="main_menu")
                ]]),
                parse_mode='Markdown'
            )
            return
            
        elif query.data == "main_menu":
            await query.message.edit_text(
                "⚡ *Welcome to LightBolt!*\n\n"
                "Your personal music companion\n"
                "───────────────────",
                reply_markup=create_main_menu(),
                parse_mode='Markdown'
            )
            return

        # Rest of the callback handling code...
    
    except Exception as e:
        print(f"Error in callback handler: {e}")
        try:
            msg = await query.message.reply_text(
                "❌ *Error*\n\n"
                "Something went wrong.\n"
                "───────────────────",
                reply_markup=create_main_menu(),
                parse_mode='Markdown'
            )
            context.user_data['last_bot_messages'] = [msg]
        except:
            pass

async def handle_download_completion(query, track, file_id, context):
    """Handle the completion of a download."""
    try:
        # Save song to database with user_id
        song = db.add_song(
            title=track['title'],
            artist=track['uploader'],
            duration=track['duration'],
            file_id=file_id,
            user_id=query.from_user.id,
            download_count=1
        )
        
        if not song:
            raise Exception("Could not save song to database")
        
        # Add song to user's playlist automatically
        if db.add_song_to_playlist(query.from_user.id, song.song_id):
            await query.message.edit_text(
                "⚡ *Success!*\n\n"
                f"Added *{track['title']}* to your playlist\n"
                "───────────────────",
                reply_markup=create_main_menu(),
                parse_mode='Markdown'
            )
        else:
            raise Exception("Could not add song to playlist")
        
    except Exception as e:
        print(f"Error in download completion: {e}")
        await query.message.edit_text(
            "❌ *Error*\n\n"
            "Could not save song.\n"
            "───────────────────",
            reply_markup=create_main_menu(),
            parse_mode='Markdown'
        )

async def show_playlist_selection(message, track, context):
    """Show playlist selection for adding downloaded song."""
    # Clean up previous messages
    if 'last_bot_messages' in context.user_data:
        for msg in context.user_data['last_bot_messages']:
            try:
                await msg.delete()
            except:
                pass
    
    playlists = db.get_user_playlists(message.chat.id)
    keyboard = []
    
    if playlists:
        for playlist in playlists:
            keyboard.append([
                InlineKeyboardButton(
                    f"📁 {playlist.name}",
                    callback_data=f"add_to_playlist_{playlist.playlist_id}_{track['file_id']}"
                )
            ])
    
    keyboard.append([InlineKeyboardButton("➕ Create New Playlist", callback_data="create_playlist_for_song")])
    keyboard.append([InlineKeyboardButton("🔙 Skip", callback_data="main_menu")])
    
    msg = await message.reply_text(
        "📱 *Save to Playlist*\n\n"
        "Choose a playlist to save this song:\n"
        "───────────────",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )
    context.user_data['last_bot_messages'] = [msg] 