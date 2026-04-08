import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './GateLogs.css';

const API_BASE_URL = 'http://localhost:5000/api';
const ITEMS_PER_PAGE = 10;

function GateLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchGateLogs();
  }, []);

  const fetchGateLogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/servo/history`);
      setLogs(response.data.events || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching gate logs:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load gate logs';
      setError(errorMessage);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLogs = logs.slice(startIndex, endIndex);

  const goToPage = (pageNum) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    }
  };

  const columns = [
    {
      header: 'Gate Type',
      accessorKey: 'gate_type',
      cell: (info) => <span className="badge">{info.getValue()}</span>,
    },
    {
      header: 'Action',
      accessorKey: 'action',
      cell: (info) => {
        const action = info.getValue();
        return (
          <span className={`action-badge ${action.toLowerCase()}`}>
            {action}
          </span>
        );
      },
    },
    {
      header: 'Angle',
      accessorKey: 'servo_angle',
      cell: (info) => `${info.getValue()}°`,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (info) => {
        const status = info.getValue();
        return (
          <span className={`status-badge ${status.toLowerCase()}`}>
            {status}
          </span>
        );
      },
    },
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      cell: (info) => new Date(info.getValue()).toLocaleString(),
    },
  ];

  if (loading) {
    return <div className="gate-logs-container"><div className="loading">Loading gate logs...</div></div>;
  }

  return (
    <div className="gate-logs-container">
      <h1>Gate Event Logs</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="logs-header">
        <p className="logs-count">Total Events: {logs.length}</p>
        <button className="refresh-btn" onClick={fetchGateLogs}>🔄 Refresh</button>
      </div>

      {logs.length === 0 ? (
        <div className="no-data">No gate events recorded yet</div>
      ) : (
        <>
          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Gate Type</th>
                  <th>Action</th>
                  <th>Angle</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'even' : 'odd'}>
                    <td><span className="badge">{log.gate_type}</span></td>
                    <td>
                      <span className={`action-badge ${log.action.toLowerCase()}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>{log.servo_angle}°</td>
                    <td>
                      <span className={`status-badge ${log.status.toLowerCase()}`}>
                        {log.status}
                      </span>
                    </td>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
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
              <span className="page-size">({paginatedLogs.length} of {logs.length} items)</span>
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

export default GateLogs;
