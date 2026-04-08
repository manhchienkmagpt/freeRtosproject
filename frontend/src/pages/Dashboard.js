import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ParkingSlots from '../components/ParkingSlots';
import GateStatus from '../components/GateStatus';
import './Dashboard.css';

const API_BASE_URL = 'http://localhost:5000/api';

function Dashboard() {
  const [parkingData, setParkingData] = useState(null);
  const [gateData, setGateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [parkingRes, servoRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/parking-status`),
        axios.get(`${API_BASE_URL}/servo/status`)
      ]);

      setParkingData(parkingRes.data);
      setGateData(servoRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
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

      <button className="refresh-btn" onClick={fetchDashboardData}>
        🔄 Refresh
      </button>
    </div>
  );
}

export default Dashboard;
