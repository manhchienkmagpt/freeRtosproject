import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import AlarmDialog from './components/AlarmDialog';
import Dashboard from './pages/Dashboard';
import GateLogs from './pages/GateLogs';
import AlarmLogs from './pages/AlarmLogs';
import './App.css';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [currentAlarm, setCurrentAlarm] = useState(null);

  useEffect(() => {
    // Connect to WebSocket for real-time alarm alerts
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    // Listen for alarm events
    socket.on('alarmTriggered', (alarmData) => {
      console.log('🚨 ALARM TRIGGERED:', alarmData);
      setCurrentAlarm(alarmData);
    });

    return () => {
      socket.close();
    };
  }, []);

  const handleAlarmClose = () => {
    setCurrentAlarm(null);
  };

  return (
    <Router>
      <div className="app-container">
        <AlarmDialog alarm={currentAlarm} onClose={handleAlarmClose} />
        
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/gate-logs" element={<GateLogs />} />
            <Route path="/alarm-logs" element={<AlarmLogs />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
