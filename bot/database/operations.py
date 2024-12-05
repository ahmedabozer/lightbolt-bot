from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
from typing import List, Optional

from config import DB_URL
from .models import Base, User, Playlist, Song

# Create database engine and session
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)

class DatabaseManager:
    def __init__(self):
        self.Session = Session

    def get_session(self):
        """Get a new session."""
        return self.Session()

    # User operations
    def create_user(self, user_id: int, username: str) -> Optional[User]:
        """Create a new user if not exists."""
        session = self.get_session()
        try:
            user = session.query(User).filter(User.user_id == user_id).first()
            if not user:
                user = User(user_id=user_id, username=username)
                session.add(user)
                session.commit()
                session.refresh(user)
            return user
        except SQLAlchemyError as e:
            print(f"Error creating user: {e}")
            session.rollback()
            return None
        finally:
            session.close()

    def get_user(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        session = self.get_session()
        try:
            user = session.query(User).filter(User.user_id == user_id).first()
            if user:
                session.refresh(user)
            return user
        except SQLAlchemyError as e:
            print(f"Error getting user: {e}")
            return None
        finally:
            session.close()

    # Playlist operations
    def get_or_create_user_playlist(self, user_id: int) -> Optional[Playlist]:
        """Get the user's default playlist or create it if it doesn't exist."""
        try:
            with Session() as session:
                playlist = session.query(Playlist).filter(Playlist.user_id == user_id).first()
                if not playlist:
                    # Create default playlist for user
                    playlist = Playlist(
                        user_id=user_id,
                        name="My Music"
                    )
                    session.add(playlist)
                    session.commit()
                    session.refresh(playlist)
                return playlist
        except Exception as e:
            print(f"Error getting/creating playlist: {e}")
            return None

    def add_song_to_playlist(self, user_id: int, song_id: int) -> bool:
        """Add a song to user's default playlist."""
        try:
            with Session() as session:
                # Get or create user's playlist
                playlist = session.query(Playlist).filter(Playlist.user_id == user_id).first()
                if not playlist:
                    playlist = Playlist(user_id=user_id, name="My Music")
                    session.add(playlist)
                    session.commit()
                
                # Get the song
                song = session.query(Song).filter(
                    Song.song_id == song_id,
                    Song.user_id == user_id
                ).first()
                
                if not song:
                    return False
                
                # Add song to playlist if not already there
                if song not in playlist.songs:
                    playlist.songs.append(song)
                    session.commit()
                return True
        except Exception as e:
            print(f"Error adding song to playlist: {e}")
            return False

    def get_playlist_songs(self, user_id: int) -> List[Song]:
        """Get all songs in user's playlist."""
        try:
            with Session() as session:
                playlist = session.query(Playlist).filter(Playlist.user_id == user_id).first()
                if not playlist:
                    return []
                
                songs = []
                for song in playlist.songs:
                    song_data = {
                        'song_id': song.song_id,
                        'title': song.title,
                        'artist': song.artist,
                        'duration': song.duration,
                        'file_id': song.file_id,
                        'user_id': song.user_id,
                        'download_count': song.download_count
                    }
                    songs.append(Song(**song_data))
                return songs
        except Exception as e:
            print(f"Error getting playlist songs: {e}")
            return []

    def remove_song_from_playlist(self, user_id: int, song_id: int) -> bool:
        """Remove a song from user's playlist."""
        try:
            with Session() as session:
                playlist = session.query(Playlist).filter(Playlist.user_id == user_id).first()
                if not playlist:
                    return False
                
                song = session.query(Song).filter(
                    Song.song_id == song_id,
                    Song.user_id == user_id
                ).first()
                
                if not song:
                    return False
                
                if song in playlist.songs:
                    playlist.songs.remove(song)
                    session.commit()
                return True
        except Exception as e:
            print(f"Error removing song from playlist: {e}")
            return False

    # Song operations
    def add_song(self, title: str, artist: str, duration: int, file_id: str, user_id: int, download_count: int = 1) -> Optional[Song]:
        """Add a new song to the database."""
        try:
            with Session() as session:
                song = Song(
                    title=title,
                    artist=artist,
                    duration=duration,
                    file_id=file_id,
                    user_id=user_id,
                    download_count=download_count
                )
                session.add(song)
                session.commit()
                # Refresh the song object to ensure it's bound to the session
                session.refresh(song)
                # Create a new dictionary with the song's attributes
                song_data = {
                    'song_id': song.song_id,
                    'title': song.title,
                    'artist': song.artist,
                    'duration': song.duration,
                    'file_id': song.file_id,
                    'user_id': song.user_id,
                    'download_count': song.download_count
                }
                return Song(**song_data)
        except Exception as e:
            print(f"Error adding song: {e}")
            return None

    def get_user_songs(self, user_id: int) -> List[Song]:
        """Get all songs that belong to a user."""
        try:
            with Session() as session:
                return session.query(Song).filter(Song.user_id == user_id).all()
        except Exception as e:
            print(f"Error getting user songs: {e}")
            return []

    def get_song_by_id(self, song_id: int) -> Optional[Song]:
        """Get a song by its ID."""
        try:
            with Session() as session:
                song = session.query(Song).filter(Song.song_id == song_id).first()
                if song:
                    # Refresh the song object to ensure it's bound to the session
                    session.refresh(song)
                    # Create a new dictionary with the song's attributes
                    song_data = {
                        'song_id': song.song_id,
                        'title': song.title,
                        'artist': song.artist,
                        'duration': song.duration,
                        'file_id': song.file_id,
                        'user_id': song.user_id,
                        'download_count': song.download_count
                    }
                    return Song(**song_data)
                return None
        except Exception as e:
            print(f"Error getting song: {e}")
            return None

    def increment_download_count(self, song_id: int) -> bool:
        """Increment the download count for a song."""
        session = self.get_session()
        try:
            song = session.query(Song).filter(Song.song_id == song_id).first()
            if song:
                song.download_count += 1
                session.commit()
                session.refresh(song)
                return True
            return False
        except SQLAlchemyError as e:
            print(f"Error incrementing download count: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    # Cleanup operations
    def remove_song(self, song_id: int) -> bool:
        """Remove a song from the database."""
        session = self.get_session()
        try:
            song = session.query(Song).filter(Song.song_id == song_id).first()
            if song:
                session.delete(song)
                session.commit()
                return True
            return False
        except SQLAlchemyError as e:
            print(f"Error removing song: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def remove_playlist(self, playlist_id: int) -> bool:
        """Remove a playlist."""
        session = self.get_session()
        try:
            playlist = session.query(Playlist).filter(Playlist.playlist_id == playlist_id).first()
            if playlist:
                session.delete(playlist)
                session.commit()
                return True
            return False
        except SQLAlchemyError as e:
            print(f"Error removing playlist: {e}")
            session.rollback()
            return False
        finally:
            session.close()

    def get_song_by_file_id(self, file_id: str) -> Optional[Song]:
        """Get song by file_id."""
        session = self.get_session()
        try:
            song = session.query(Song).filter(Song.file_id == file_id).first()
            if song:
                session.refresh(song)
            return song
        except SQLAlchemyError as e:
            print(f"Error getting song by file_id: {e}")
            return None
        finally:
            session.close()

    def get_user_songs(self, user_id: int) -> List[Song]:
        """Get all songs that belong to a user's playlists."""
        try:
            with Session() as session:
                # Get all playlists for the user
                playlists = session.query(Playlist).filter(Playlist.user_id == user_id).all()
                
                # Get all unique songs from all user's playlists
                songs = set()
                for playlist in playlists:
                    for song in playlist.songs:
                        songs.add(song)
                
                return list(songs)
        except Exception as e:
            print(f"Error getting user songs: {e}")
            return [] 