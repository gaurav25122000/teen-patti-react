// src/components/MusicPlayer.tsx
import React, { useState } from 'react';
import YouTube from 'react-youtube';
import './MusicPlayer.css';

const MusicPlayer: React.FC = () => {
    const [videoId, setVideoId] = useState('jfKfPfyJRdk'); // Default video
    const [playlistId, setPlaylistId] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const opts = {
        height: '150',
        width: '100%',
        playerVars: {
            autoplay: 1,
            listType: 'playlist',
            list: playlistId,
        },
    };

    const extractIds = (url: string) => {
        try {
            const urlObj = new URL(url);
            const video = urlObj.searchParams.get('v');
            const playlist = urlObj.searchParams.get('list');
            return { video, playlist };
        } catch (e) {
            // Not a valid URL, assume it's an ID
            return { video: url, playlist: null };
        }
    }

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { video, playlist } = extractIds(event.target.value);
        if (video) {
            setVideoId(video);
        }
        setPlaylistId(playlist);
    };

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
                        placeholder="Enter YouTube URL or Video ID"
                        onChange={handleUrlChange}
                    />
                </div>
            </div>
        </div>
    );
};

export default MusicPlayer;
