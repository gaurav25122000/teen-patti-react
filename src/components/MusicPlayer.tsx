// src/components/MusicPlayer.tsx
import React, { useState } from 'react';
import YouTube from 'react-youtube';
import './MusicPlayer.css';

const MusicPlayer: React.FC = () => {
    const [videoId, setVideoId] = useState('jfKfPfyJRdk'); // Default video
    const [playlistId, setPlaylistId] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [playlist, setPlaylist] = useState<any[]>([]);
    const [apiKey, setApiKey] = useState('');

    const opts = {
        height: '150',
        width: '100%',
        playerVars: {
            autoplay: 1,
            listType: 'playlist',
            list: playlistId,
        },
    };

    const handleSearch = async () => {
        if (!apiKey) {
            alert('Please enter a YouTube API key.');
            return;
        }

        try {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${searchTerm}&key=${apiKey}`
            );
            const data = await response.json();
            setSearchResults(data.items);
        } catch (error) {
            console.error('Error searching for videos:', error);
        }
    };

    const handlePlayFromSearch = (video: any) => {
        setVideoId(video.id.videoId);
        setPlaylistId(null);
        setPlaylist([]);
        fetchPlaylist(video.id.videoId);
    };

    const fetchPlaylist = async (videoId: string) => {
        if (!apiKey) {
            return;
        }
        try {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&relatedToVideoId=${videoId}&key=${apiKey}`
            );
            const data = await response.json();
            setPlaylist(data.items);
        } catch (error) {
            console.error('Error fetching playlist:', error);
        }
    };

    const handleNext = () => {
        const currentIndex = playlist.findIndex((item) => item.id.videoId === videoId);
        if (currentIndex < playlist.length - 1) {
            setVideoId(playlist[currentIndex + 1].id.videoId);
        }
    };

    const handlePrevious = () => {
        const currentIndex = playlist.findIndex((item) => item.id.videoId === videoId);
        if (currentIndex > 0) {
            setVideoId(playlist[currentIndex - 1].id.videoId);
        }
    };

    React.useEffect(() => {
        if (playlistId) {
            fetchPlaylist(videoId);
        }
    }, [playlistId, videoId, apiKey]);

    return (
        <div className={`music-player-container ${isVisible ? 'visible' : ''}`}>
            <button className="toggle-btn" onClick={() => setIsVisible(!isVisible)}>
                {isVisible ? 'Hide' : 'Show'} Music Player
            </button>
            <div className="player-content">
                <h3>YouTube Music</h3>
                <div className="video-container">
                    <YouTube videoId={videoId} opts={opts} />
                </div>
                <div className="controls">
                    <input
                        type="text"
                        placeholder="Enter YouTube API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Search for a song"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button onClick={handleSearch}>Search</button>
                </div>
                <div className="playback-controls">
                    <button onClick={handlePrevious}>Previous</button>
                    <button onClick={handleNext}>Next</button>
                </div>
                <div className="playlist">
                    <h4>Playlist</h4>
                    <ul>
                        {playlist.map((item, index) => (
                            <li key={index} onClick={() => setVideoId(item.id.videoId)}>
                                <img src={item.snippet.thumbnails.default.url} alt={item.snippet.title} />
                                <span>{item.snippet.title}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="search-results">
                    <h4>Search Results</h4>
                    <ul>
                        {searchResults.map((item, index) => (
                            <li key={index} onClick={() => handlePlayFromSearch(item)}>
                                <img src={item.snippet.thumbnails.default.url} alt={item.snippet.title} />
                                <span>{item.snippet.title}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default MusicPlayer;
