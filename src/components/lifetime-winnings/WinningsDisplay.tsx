// src/components/lifetime-winnings/WinningsDisplay.tsx
import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

interface WinningsDisplayProps {
  winnings: any[];
}

const WinningsDisplay: React.FC<WinningsDisplayProps> = ({ winnings }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (chartRef.current && winnings) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const datasets = Array.isArray(winnings) ? winnings.map(playerData => {
        const gameWinnings = playerData.games ? playerData.games.map((game: any) => game.winnings) : [];
        return {
          label: `Player ${playerData.phoneNumber}`,
          data: gameWinnings,
          fill: false,
          borderColor: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          tension: 0.1,
        };
      }) : [];

      const labels = Array.isArray(winnings) && winnings.length > 0 && winnings[0].games ? winnings[0].games.map((_: any, index: number) => `Game ${index + 1}`) : [];

      chartInstance.current = new Chart(chartRef.current, {
        type: 'line',
        data: {
          labels,
          datasets,
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        },
      });
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [winnings]);

  return (
    <div className="winnings-display">
      <h3>Winnings Breakdown</h3>
      {Array.isArray(winnings) && winnings.map((playerData, index) => (
        <div key={index}>
          <h4>Player: {playerData.phoneNumber}</h4>
          <p>Total Poker Winnings: {playerData.poker?.totalWinnings || 0}</p>
          <p>Total Teen Patti Winnings: {playerData.teenPatti?.totalWinnings || 0}</p>
        </div>
      ))}
      <canvas ref={chartRef} />
    </div>
  );
};

export default WinningsDisplay;
