import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AlarmLogs.css';

const API_BASE_URL = 'http://localhost:5000/api';
const ITEMS_PER_PAGE = 10;

function AlarmLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchAlarmLogs();
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
        <button className="refresh-btn" onClick={fetchAlarmLogs}>🔄 Refresh</button>
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
                  <tr key={index} className={index % 2 === 0 ? 'even' : 'odd'}>
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
