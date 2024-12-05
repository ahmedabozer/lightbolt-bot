from datetime import datetime
import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from config import DB_URL

Base = declarative_base()

# Association table for playlist songs
playlist_songs = Table(
    'playlist_songs',
    Base.metadata,
    Column('playlist_id', Integer, ForeignKey('playlists.playlist_id')),
    Column('song_id', Integer, ForeignKey('songs.song_id')),
    Column('added_at', DateTime, default=datetime.utcnow)
)

class User(Base):
    __tablename__ = 'users'
    
    user_id = Column(Integer, primary_key=True)
    username = Column(String(255))
    join_date = Column(DateTime, default=datetime.utcnow)
    premium_status = Column(Boolean, default=False)
    
    # Relationships
    playlists = relationship('Playlist', back_populates='user')
    songs = relationship('Song', back_populates='user')

class Playlist(Base):
    __tablename__ = 'playlists'
    
    playlist_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.user_id'))
    name = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='playlists')
    songs = relationship('Song', secondary=playlist_songs, back_populates='playlists')

class Song(Base):
    __tablename__ = 'songs'
    
    song_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.user_id'))
    title = Column(String(255))
    artist = Column(String(255))
    duration = Column(Integer)  # Duration in seconds
    file_id = Column(String(512))  # Telegram file_id for offline access
    download_count = Column(Integer, default=0)
    added_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship('User', back_populates='songs')
    playlists = relationship('Playlist', secondary=playlist_songs, back_populates='songs')

def recreate_database():
    """Drop all tables and recreate them."""
    # Remove existing database file
    if os.path.exists('bot.db'):
        os.remove('bot.db')
    
    # Create engine and recreate all tables
    engine = create_engine(DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Database recreated successfully!")

# Create database and tables
def init_db():
    engine = create_engine(DB_URL)
    Base.metadata.create_all(engine)

if __name__ == '__main__':
    recreate_database() 