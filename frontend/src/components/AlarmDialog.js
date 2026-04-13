import React, { useEffect, useState } from 'react';
import './AlarmDialog.css';

function AlarmDialog({ alarm, onClose }) {
  const [isVisible, setIsVisible] = useState(!!alarm);
  const [soundPlayed, setSoundPlayed] = useState(false);

  useEffect(() => {
    if (alarm) {
      setIsVisible(true);
      setSoundPlayed(false);
      
      // Play alert sound
      playAlertSound();
      
      // Auto-hide after 10 seconds if not closed
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for animation
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [alarm, onClose]);

  const playAlertSound = () => {
    if (soundPlayed) return;
    
    try {
      // Create beep sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000; // Frequency in Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      setSoundPlayed(true);
    } catch (error) {
      console.error('Error playing alarm sound:', error);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for animation
  };

  if (!alarm || !isVisible) {
    return null;
  }

  const isFlame = alarm.alarm_type === 'FLAME';
  const isSmoke = alarm.alarm_type === 'SMOKE';
  const alarmIcon = isFlame ? '🔥' : isSmoke ? '💨' : '⚠️';
  const alarmTitle = isFlame ? 'FLAME DETECTED' : isSmoke ? 'SMOKE DETECTED' : 'ALARM';
  const alarmColor = isFlame ? 'flame' : 'smoke';

  return (
    <div className={`alarm-overlay ${isVisible ? 'visible' : ''}`}>
      <div className={`alarm-dialog ${alarmColor}`}>
        <div className="alarm-header">
          <span className="alarm-icon">{alarmIcon}</span>
          <h2>{alarmTitle}</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="alarm-body">
          <div className="alarm-detail">
            <span className="label">Type:</span>
            <span className="value">{alarm.alarm_type}</span>
          </div>

          <div className="alarm-detail">
            <span className="label">Sensor Value:</span>
            <span className="value">{alarm.sensor_value}</span>
          </div>

          <div className="alarm-detail">
            <span className="label">Time:</span>
            <span className="value">
              {new Date(alarm.alarm_time).toLocaleString('vi-VN')}
            </span>
          </div>

          <div className="alarm-detail">
            <span className="label">Status:</span>
            <span className={`value status ${alarm.resolved ? 'resolved' : 'active'}`}>
              {alarm.resolved ? '✓ RESOLVED' : '🔴 ACTIVE'}
            </span>
          </div>
        </div>

        <div className="alarm-footer">
          <button className="btn-close" onClick={handleClose}>
            Close Alert
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlarmDialog;
