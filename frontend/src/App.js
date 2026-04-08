import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import GateLogs from './pages/GateLogs';
import AlarmLogs from './pages/AlarmLogs';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
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
