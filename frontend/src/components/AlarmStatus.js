import React from 'react';
import './AlarmStatus.css';

function AlarmStatus({ data }) {
  const hasActiveAlarms = data && data.active_alarms > 0;

  return (
    <div className={`alarm-status ${hasActiveAlarms ? 'active' : 'safe'}`}>
      <div className="alarm-indicator">
        <div className={`alarm-light ${hasActiveAlarms ? 'alarm-on' : 'alarm-off'}`}>
          {hasActiveAlarms ? '⚠️' : '✓'}
        </div>
        <div className="alarm-text">
          <div className="alarm-title">
            {hasActiveAlarms ? 'ALARM ACTIVE' : 'ALL CLEAR'}
          </div>
          <div className="alarm-count">
            {data && data.active_alarms > 0 
              ? `${data.active_alarms} Active Alert${data.active_alarms > 1 ? 's' : ''}`
              : 'No active alarms'}
          </div>
        </div>
      </div>

      {data && data.alarms && data.alarms.length > 0 && (
        <div className="alarm-list">
          <h4>Recent Alarms</h4>
          {data.alarms.slice(0, 5).map((alarm, index) => (
            <div key={index} className="alarm-item">
              <span className={`alarm-type ${alarm.alarm_type.toLowerCase()}`}>
                {alarm.alarm_type}
              </span>
              <span className="alarm-value">Value: {alarm.sensor_value}</span>
              <span className="alarm-time">
                {new Date(alarm.alarm_time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AlarmStatus;
