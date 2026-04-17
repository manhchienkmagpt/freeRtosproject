import React from 'react';
import './ParkingSlots.css';

function ParkingSlots({ data }) {
  if (!data || !data.slots) {
    return <div className="no-data">No parking data available</div>;
  }

  return (
    <div className="parking-slots">
      <div className="parking-info">
        <div className="info-item">
          <span className="label">Total Slots</span>
          <span className="value">{data.total_slots}</span>
        </div>
        <div className="info-item">
          <span className="label">Occupied</span>
          <span className="value occupied">{data.occupied_slots}</span>
        </div>
        <div className="info-item">
          <span className="label">Available</span>
          <span className="value available">{data.available_slots}</span>
        </div>
        <div className="info-item">
          <span className="label">Occupancy</span>
          <span className="value">{data.occupancy_percentage}%</span>
        </div>
      </div>

      <div className="slots-grid">
        {data.slots.map((slot, index) => (
          <div
            key={slot.slot_id}
            className={`parking-slot ${slot.is_occupied ? 'occupied' : 'empty'}`}
            title={`${slot.slot_name} - ${slot.is_occupied ? 'Occupied' : 'Empty'}`}
          >
            <div className="slot-number">{slot.slot_id}</div>
            <div className="slot-status">
              {slot.is_occupied ? 'Occupied' : 'Empty'}
            </div>
            <div className="slot-time">
              {slot.updated_at ? new Date(slot.updated_at).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        ))}
      </div>

      <div className="occupancy-bar">
        <div className="bar-background">
          <div
            className="bar-fill"
            style={{ width: `${data.occupancy_percentage}%` }}
          ></div>
        </div>
        <span className="bar-label">{data.occupancy_percentage}% Occupancy</span>
      </div>
    </div>
  );
}

export default ParkingSlots;
