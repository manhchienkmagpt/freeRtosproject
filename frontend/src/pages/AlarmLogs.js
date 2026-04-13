import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './AlarmLogs.css';

const API_BASE_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const ITEMS_PER_PAGE = 10;

function AlarmLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchAlarmLogs();
  }, []);

  // Setup WebSocket for real-time alarm updates
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    newSocket.on('alarmTriggered', (alarmData) => {
      console.log('🚨 Real-time alarm triggered:', alarmData);
      
      // Add new alarm to the top of the list
      const newAlarm = {
        alarm_id: alarmData.alarm_id,
        alarm_type: alarmData.alarm_type,
        sensor_value: alarmData.sensor_value,
        severity: alarmData.alarm_type === 'FLAME' ? 'CRITICAL' : 'HIGH',
        alarm_time: alarmData.alarm_time,
        resolved: alarmData.resolved ? 1 : 0,
        resolved_time: null
      };
      
      setLogs(prevLogs => [newAlarm, ...prevLogs]);
      // Reset to page 1 to show newest alarm
      setCurrentPage(1);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchAlarmLogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/alarm/all`);
      setLogs(response.data.alarms || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching alarm logs:', err);
      setError('Failed to load alarm logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = filterType === 'all' 
    ? logs 
    : logs.filter(log => log.alarm_type.toLowerCase() === filterType.toLowerCase());

  // Pagination logic
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType]);

  const goToPage = (pageNum) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  // Visual indicator for new entries
  const isNewEntry = (alarmTime) => {
    const entryTime = new Date(alarmTime).getTime();
    const now = Date.now();
    return (now - entryTime) < 5000; // Highlight entries from last 5 seconds
  };

  const stats = {
    total: logs.length,
    smoke: logs.filter(log => log.alarm_type === 'SMOKE').length,
    flame: logs.filter(log => log.alarm_type === 'FLAME').length,
    active: logs.filter(log => log.resolved === 0).length,
    resolved: logs.filter(log => log.resolved === 1).length,
  };

  if (loading) {
    return <div className="alarm-logs-container"><div className="loading">Loading alarm logs...</div></div>;
  }

  return (
    <div className="alarm-logs-container">
      <h1>Alarm Event Logs</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Stats Section */}
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Alarms</div>
        </div>
        <div className="stat-card smoke">
          <div className="stat-value">{stats.smoke}</div>
          <div className="stat-label">Smoke Alerts</div>
        </div>
        <div className="stat-card flame">
          <div className="stat-value">{stats.flame}</div>
          <div className="stat-label">Flame Alerts</div>
        </div>
        <div className="stat-card active">
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card resolved">
          <div className="stat-value">{stats.resolved}</div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      {/* Filter and Actions */}
      <div className="logs-header">
        <div className="filter-group">
          <label>Filter by Type:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="smoke">Smoke</option>
            <option value="flame">Flame</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="no-data">No alarm events found</div>
      ) : (
        <>
          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Alarm Type</th>
                  <th>Sensor Value</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Alarm Time</th>
                  <th>Resolved At</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'even' : 'odd'} ${isNewEntry(log.alarm_time) ? 'new-entry' : ''}`}>
                    <td>
                      <span className={`type-badge ${log.alarm_type.toLowerCase()}`}>
                        {log.alarm_type}
                      </span>
                    </td>
                    <td className="value-mono">{log.sensor_value}</td>
                    <td>
                      <span className={`severity-badge ${(log.severity || 'high').toLowerCase()}`}>
                        {log.severity || 'HIGH'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${log.resolved === 0 ? 'active' : 'resolved'}`}>
                        {log.resolved === 0 ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                    </td>
                    <td>{new Date(log.alarm_time).toLocaleString()}</td>
                    <td>{log.resolved_time ? new Date(log.resolved_time).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="pagination">
            <button 
              className="pagination-btn" 
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            
            <div className="pagination-info">
              Page <span className="current-page">{currentPage}</span> of <span className="total-pages">{totalPages}</span>
              <span className="page-size">({paginatedLogs.length} of {filteredLogs.length} items)</span>
            </div>

            <button 
              className="pagination-btn" 
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default AlarmLogs;
