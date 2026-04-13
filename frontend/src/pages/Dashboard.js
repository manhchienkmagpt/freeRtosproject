import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ParkingSlots from '../components/ParkingSlots';
import GateStatus from '../components/GateStatus';
import './Dashboard.css';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function Dashboard() {
  const [parkingData, setParkingData] = useState(null);
  const [gateData, setGateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize Socket.IO connection
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
      // Request initial data on connection
      fetchDashboardData();
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
    });

    // Listen for real-time slot updates
    newSocket.on('slotStatusUpdate', (data) => {
      console.log('Received real-time slot update:', data);
      setParkingData(data);
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setError('WebSocket connection failed - falling back to polling');
      // Fallback to polling if WebSocket fails
      const interval = setInterval(fetchDashboardData, 5000);
      return () => clearInterval(interval);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Listen for real-time gate status updates via WebSocket
  useEffect(() => {
    if (!socket) return;
    
    // Listen for gate status updates
    socket.on('gateStatusUpdate', (data) => {
      console.log('Received real-time gate update:', data);
      setGateData(data);
    });

    return () => {
      socket.off('gateStatusUpdate');
    };
  }, [socket]);

  // Fallback: Load gate status on initial connection
  useEffect(() => {
    if (!isConnected) return;
    fetchGateStatus();
  }, [isConnected]);

  const fetchDashboardData = async () => {
    try {
      const parkingRes = await axios.get(`${API_BASE_URL}/parking-status`);
      setParkingData(parkingRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load parking data');
    } finally {
      setLoading(false);
    }
  };

  const fetchGateStatus = async () => {
    try {
      const servoRes = await axios.get(`${API_BASE_URL}/servo/status`);
      setGateData(servoRes.data);
    } catch (err) {
      console.error('Error fetching gate status:', err);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <h1>Smart Parking Management System</h1>
      
      <div className="connection-status">
        <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
        {isConnected ? 'Real-time Connected' : 'Polling Mode (WebSocket Disconnected)'}
      </div>
      
      {error && <div className="error-message">{error}</div>}

      <div className="dashboard-grid">
        {/* Parking Slots Section */}
        <section className="dashboard-section parking-section">
          <h2>Parking Slots Status</h2>
          {parkingData && <ParkingSlots data={parkingData} />}
        </section>

        {/* Gates Section */}
        <section className="dashboard-section gates-section">
          <h2>Gate Status</h2>
          {gateData && <GateStatus data={gateData} />}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
