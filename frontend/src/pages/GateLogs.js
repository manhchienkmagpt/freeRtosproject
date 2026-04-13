import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './GateLogs.css';

const API_BASE_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const ITEMS_PER_PAGE = 10;

function GateLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchGateLogs();
  }, []);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    newSocket.on('gateStatusUpdate', (data) => {
      console.log('📊 Real-time gate status update:', data);
      
      // Create a new log entry from the gate status update
      if (data.changed_gate && data.action) {
        const newLogEntry = {
          event_id: Date.now() + Math.random(),
          gate_type: data.changed_gate,
          action: data.action,
          status: 'SUCCESS',
          servo_angle: data.gates[data.changed_gate]?.current_position || 0,
          timestamp: data.timestamp,
          created_at: data.timestamp
        };
        
        setLogs(prevLogs => [newLogEntry, ...prevLogs]);
        // Reset to page 1 to show newest entry
        setCurrentPage(1);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchGateLogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/servo/history`);
      const logsData = response.data.events || [];
      // Sort logs by created_at from latest to earliest
      const sortedLogs = logsData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setLogs(sortedLogs);
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

  // Visual indicator for new entries
  const isNewEntry = (timestamp) => {
    const entryTime = new Date(timestamp).getTime();
    const now = Date.now();
    return (now - entryTime) < 5000; // Highlight entries from last 5 seconds
  };

  // Reverse action display (fix inverted logic)
  const getReverseAction = (action) => {
    if (action === 'OPEN') return 'CLOSE';
    if (action === 'CLOSE') return 'OPEN';
    return action;
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
                  <tr key={index} className={`${index % 2 === 0 ? 'even' : 'odd'} ${isNewEntry(log.created_at || log.timestamp) ? 'new-entry' : ''}`}>
                    <td><span className="badge">{log.gate_type}</span></td>
                    <td>
                      <span className={`action-badge ${getReverseAction(log.action).toLowerCase()}`}>
                        {getReverseAction(log.action)}
                      </span>
                    </td>
                    <td>{log.servo_angle}°</td>
                    <td>
                      <span className={`status-badge ${log.status.toLowerCase()}`}>
                        {log.status}
                      </span>
                    </td>
                    <td>{new Date(log.created_at || log.timestamp).toLocaleString()}</td>
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
