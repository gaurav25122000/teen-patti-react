// src/components/MusicPlayer.tsx
import React, { useState } from 'react';
import YouTube from 'react-youtube';
import './MusicPlayer.css';

interface MusicPlayerProps {
    isOpen: boolean;
    onClose: () => void;
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({ isOpen, onClose }) => {
    const [videoId, setVideoId] = useState('jfKfPfyJRdk'); // Default video

    if (!isOpen) {
        return null;
    }

    const opts = {
        height: '390',
        width: '640',
        playerVars: {
            autoplay: 1,
        },
    };

    const handleVideoIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setVideoId(event.target.value);
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
        <div className="music-player-modal">
            <div className="music-player-content">
                <button className="close-btn" onClick={onClose}>&times;</button>
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
