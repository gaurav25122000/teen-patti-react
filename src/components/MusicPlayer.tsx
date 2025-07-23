// src/components/MusicPlayer.tsx
import React, { useState } from 'react';
import YouTube from 'react-youtube';
import './MusicPlayer.css';

const MusicPlayer: React.FC = () => {
    const [videoId, setVideoId] = useState('jfKfPfyJRdk'); // Default video
    const [isVisible, setIsVisible] = useState(false);

    const opts = {
        height: '150',
        width: '100%',
        playerVars: {
            autoplay: 1,
        },
    };

    const extractVideoId = (url: string) => {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'youtu.be') {
                return urlObj.pathname.slice(1);
            } else if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
                return urlObj.searchParams.get('v');
            }
        } catch (e) {
            // Not a valid URL, assume it's an ID
            return url;
        }
        return null;
    }

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newVideoId = extractVideoId(event.target.value);
        if (newVideoId) {
            setVideoId(newVideoId);
        }
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
