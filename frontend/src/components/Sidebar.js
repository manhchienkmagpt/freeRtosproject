import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome, FiLogOut, FiAlertTriangle } from 'react-icons/fi';
import './Sidebar.css';

function Sidebar() {
  return (
    <header className="navbar">
      <div className="navbar-container">
        <nav className="navbar-nav">
          <Link to="/" className="nav-item">
            <FiHome size={20} />
            <span>Dashboard</span>
          </Link>
          
          <Link to="/gate-logs" className="nav-item">
            <FiLogOut size={20} />
            <span>Gate Logs</span>
          </Link>
          
          <Link to="/alarm-logs" className="nav-item">
            <FiAlertTriangle size={20} />
            <span>Alarm Logs</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default Sidebar;
