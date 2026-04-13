import React from 'react';
import './GateStatus.css';

function GateStatus({ data }) {
  // Handle different API response formats
  let gatesObj = {};
  
  if (data) {
    if (data.gates && typeof data.gates === 'object' && !Array.isArray(data.gates)) {
      // API response format: { gates: { GATE_IN: {...}, GATE_OUT: {...} } }
      gatesObj = data.gates;
    } else if (Array.isArray(data)) {
      // Array format: convert to object by gate_type
      data.forEach(gate => {
        gatesObj[gate.gate_type] = gate;
      });
    } else if (typeof data === 'object' && data.gate_type) {
      // Single gate object
      gatesObj[data.gate_type] = data;
    }
  }

  const gateIn = gatesObj['GATE_IN'] || null;
  const gateOut = gatesObj['GATE_OUT'] || null;

  const GateCard = ({ gate, label }) => {
    if (!gate) {
      return (
        <div className="gate-card">
          <div className="gate-header">
            <h3>{label}</h3>
            <div className="gate-indicator no-data">No Data</div>
          </div>
        </div>
      );
    }

    return (
      <div className="gate-card">
        <div className="gate-header">
          <h3>{label}</h3>
          <div className={`gate-indicator ${gate.is_open ? 'open' : 'closed'}`}>
            {gate.is_open ? '🔓 OPEN' : '🔒 CLOSED'}
          </div>
        </div>

        <div className="gate-details">
          <div className="detail-row">
            <span className="label">Current Position:</span>
            <span className="value">{gate.current_position}°</span>
          </div>

          <div className="detail-row">
            <span className="label">Last Action:</span>
            <span className="value">{gate.last_action || 'None'}</span>
          </div>

          <div className="detail-row">
            <span className="label">Last Updated:</span>
            <span className="value">
              {gate.updated_at 
                ? new Date(gate.updated_at).toLocaleString()
                : 'Never'}
            </span>
          </div>

          <div className="detail-row">
            <span className="label">Total Operations:</span>
            <span className="value">{gate.total_operations || 0}</span>
          </div>
        </div>

        <div className="position-bar">
          <div className="bar-track">
            <div 
              className="bar-indicator"
              style={{ left: `${gate.current_position}%` }}
            ></div>
            <div className="bar-bg" style={{ width: `${gate.current_position}%` }}></div>
          </div>
          <div className="bar-labels">
            <span>Closed</span>
            <span>Open</span>
          </div>
        </div>
      </div>
    );
  };

  if (!gateIn && !gateOut) {
    return <div className="no-data">No gate data available</div>;
  }

  return (
    <div className="gate-status">
      <GateCard gate={gateIn} label="🚪 Cổng Vào (Gate IN)" />
      <GateCard gate={gateOut} label="🚪 Cổng Ra (Gate OUT)" />
    </div>
  );
}

export default GateStatus;
