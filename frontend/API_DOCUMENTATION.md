# Smart Parking System - API Documentation

## Overview
This document describes all API endpoints for the Smart Parking Management System backend. The API is built with Express.js and uses MySQL database.

**Base URL:** `http://localhost:5000/api`  
**Port:** 5000  
**Database:** parking_system (MySQL 8.0)

---

## Table of Contents
1. [System Health Endpoints](#system-health-endpoints)
2. [Vehicle Endpoints](#vehicle-endpoints)
3. [Alarm Endpoints](#alarm-endpoints)
4. [Servo Gate Endpoints](#servo-gate-endpoints)
5. [Parking Slots Endpoints](#parking-slots-endpoints)

---

## System Health Endpoints

### GET `/health`
Health check endpoint to verify server is running.

**Request:**
```
GET http://localhost:5000/health
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2026-04-07T10:42:45.000Z",
  "uptime": 3600.5
}
```

---

### GET `/api/system/status`
Get overall system status and statistics.

**Request:**
```
GET http://localhost:5000/api/system/status
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2026-04-07T10:42:45.000Z",
  "total_vehicles_processed": 125,
  "occupied_slots": 3,
  "total_available_slots": 6,
  "total_revenue": 2500000,
  "uptime_seconds": 3600
}
```

---

## Vehicle Endpoints

### POST `/api/vehicle/enter`
Record vehicle entry into parking.

**Request:**
```json
{
  "rfid_uid": "AB12CD34EF56",
  "timestamp": "2026-04-07T10:30:00.000Z",
  "parking_slots": [false, false, true, false, true, false]
}
```

**Parameters:**
- `rfid_uid` (string, required): RFID tag unique identifier
- `timestamp` (ISO 8601, optional): Entry time (defaults to current time)
- `parking_slots` (array, optional): Array of 6 booleans indicating slot occupancy

**Response (201 Created):**
```json
{
  "vehicle_id": "550e8400-e29b-41d4-a716-446655440000",
  "rfid_uid": "AB12CD34EF56",
  "user_id": "user_123",
  "user_name": "Nguyen Van A",
  "entry_time": "2026-04-07T10:30:00.000Z",
  "status": "Entry recorded",
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing or invalid RFID UID
- `409 Conflict`: Vehicle already inside the parking
- `500 Internal Server Error`: Database error

---

### POST `/api/vehicle/exit`
Record vehicle exit and process payment.

**Request:**
```json
{
  "rfid_uid": "AB12CD34EF56",
  "timestamp": "2026-04-07T11:30:00.000Z",
  "parking_slots": [false, false, false, false, false, false]
}
```

**Parameters:**
- `rfid_uid` (string, required): RFID tag unique identifier
- `timestamp` (ISO 8601, optional): Exit time (defaults to current time)
- `parking_slots` (array, optional): Updated slot occupancy status

**Response (200 OK):**
```json
{
  "vehicle_id": "550e8400-e29b-41d4-a716-446655440000",
  "rfid_uid": "AB12CD34EF56",
  "entry_time": "2026-04-07T10:30:00.000Z",
  "exit_time": "2026-04-07T11:30:00.000Z",
  "duration_minutes": 60,
  "duration_hours": 1,
  "payment_amount": 50000,
  "payment_status": "completed",
  "transaction_id": "tx_550e8400_e29b_41d4",
  "message": "Payment completed",
  "timestamp": "2026-04-07T11:30:00.000Z"
}
```

**Payment Status Values:**
- `completed`: Payment successfully processed via account balance
- `failed`: Insufficient account balance or user not found
- `pending`: Unknown user, payment pending manual review

**Error Responses:**
- `400 Bad Request`: Missing RFID UID
- `404 Not Found`: No active vehicle entry found
- `500 Internal Server Error`: Database error

---

### GET `/api/vehicle/:rfid_uid`
Get details of a specific vehicle by RFID.

**Request:**
```
GET http://localhost:5000/api/vehicle/AB12CD34EF56
```

**Response (200 OK):**
```json
{
  "vehicle": {
    "vehicle_id": "550e8400-e29b-41d4-a716-446655440000",
    "rfid_uid": "AB12CD34EF56",
    "user_id": "user_123",
    "entry_time": "2026-04-07T10:30:00.000Z",
    "exit_time": "2026-04-07T11:30:00.000Z",
    "duration_minutes": 60,
    "payment_amount": 50000,
    "payment_status": "completed",
    "entry_gate": "main",
    "exit_gate": "main",
    "gate_status": "completed"
  },
  "timestamp": "2026-04-07T11:30:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Vehicle with this RFID not found
- `500 Internal Server Error`: Database error

---

### GET `/api/vehicle/history/:user_id`
Get vehicle history for a specific user.

**Request:**
```
GET http://localhost:5000/api/vehicle/history/user_123?days=30
```

**Query Parameters:**
- `days` (integer, optional): Number of days to retrieve (default: 30)

**Response (200 OK):**
```json
{
  "user_id": "user_123",
  "days": 30,
  "total_visits": 15,
  "total_spent": 750000,
  "vehicles": [
    {
      "vehicle_id": "550e8400-e29b-41d4-a716-446655440000",
      "rfid_uid": "AB12CD34EF56",
      "entry_time": "2026-04-07T10:30:00.000Z",
      "exit_time": "2026-04-07T11:30:00.000Z",
      "duration_minutes": 60,
      "payment_amount": 50000,
      "payment_status": "completed"
    }
  ],
  "timestamp": "2026-04-07T11:30:00.000Z"
}
```

---

## Alarm Endpoints

### POST `/api/alarm/log`
Log a new alarm alert (smoke/flame detection).

**Request:**
```json
{
  "alarm_type": "SMOKE",
  "sensor_value": 85,
  "timestamp": "2026-04-07T10:42:45.000Z"
}
```

**Parameters:**
- `alarm_type` (string, required): Type of alarm - `SMOKE` or `FLAME`
- `sensor_value` (number, optional): Sensor reading value
- `timestamp` (ISO 8601, optional): Alarm time (defaults to current time)

**Response (201 Created):**
```json
{
  "alarm_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "Alert recorded",
  "alarm_type": "SMOKE",
  "sensor_value": 85,
  "timestamp": "2026-04-07T10:42:45.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Missing alarm_type
- `500 Internal Server Error`: Database error

---

### GET `/api/alarm/active`
Get all active (unresolved) alarms.

**Request:**
```
GET http://localhost:5000/api/alarm/active
```

**Response (200 OK):**
```json
{
  "active_alarms": 2,
  "alarms": [
    {
      "alarm_id": "550e8400-e29b-41d4-a716-446655440001",
      "alarm_type": "SMOKE",
      "sensor_value": 85,
      "alarm_time": "2026-04-07T10:42:45.000Z",
      "resolved": 0
    },
    {
      "alarm_id": "550e8400-e29b-41d4-a716-446655440002",
      "alarm_type": "FLAME",
      "sensor_value": 92,
      "alarm_time": "2026-04-07T10:35:20.000Z",
      "resolved": 0
    }
  ],
  "timestamp": "2026-04-07T10:42:45.000Z"
}
```

---

### GET `/api/alarm/recent`
Get recent alarm events within a specified time period.

**Request:**
```
GET http://localhost:5000/api/alarm/recent?hours=24
```

**Query Parameters:**
- `hours` (integer, optional): Number of hours to retrieve (default: 24)

**Response (200 OK):**
```json
{
  "period_hours": 24,
  "statistics": {
    "total": 10,
    "smoke_alarms": 6,
    "flame_alarms": 4,
    "active": 2,
    "resolved": 8
  },
  "alarms": [
    {
      "alarm_id": "550e8400-e29b-41d4-a716-446655440001",
      "alarm_type": "SMOKE",
      "sensor_value": 85,
      "alarm_time": "2026-04-07T10:42:45.000Z",
      "resolved": 0
    }
  ],
  "timestamp": "2026-04-07T10:42:45.000Z"
}
```

---

## Servo Gate Endpoints

### POST `/api/servo/open`
Log a servo open event (gate opening).

**Request:**
```json
{
  "gate_type": "GATE_IN",
  "servo_angle": 90,
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

**Parameters:**
- `gate_type` (string, required): Gate type - `GATE_IN` or `GATE_OUT`
- `servo_angle` (number, optional): Servo angle position (default: 90)
- `timestamp` (ISO 8601, optional): Event time (defaults to current time)

**Response (201 Created):**
```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "gate_type": "GATE_IN",
  "action": "OPEN",
  "servo_angle": 90,
  "status": "SUCCESS",
  "timestamp": "2026-04-07T10:30:00.000Z",
  "message": "Servo open event recorded"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid gate_type (must be GATE_IN or GATE_OUT)
- `500 Internal Server Error`: Database error

---

### POST `/api/servo/close`
Log a servo close event (gate closing).

**Request:**
```json
{
  "gate_type": "GATE_IN",
  "servo_angle": 0,
  "timestamp": "2026-04-07T10:30:05.000Z"
}
```

**Parameters:**
- `gate_type` (string, required): Gate type - `GATE_IN` or `GATE_OUT`
- `servo_angle` (number, optional): Servo angle position (default: 0)
- `timestamp` (ISO 8601, optional): Event time (defaults to current time)

**Response (201 Created):**
```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440001",
  "gate_type": "GATE_IN",
  "action": "CLOSE",
  "servo_angle": 0,
  "status": "SUCCESS",
  "timestamp": "2026-04-07T10:30:05.000Z",
  "message": "Servo close event recorded"
}
```

---

### GET `/api/servo/status`
Get current status of all servo gates.

**Request:**
```
GET http://localhost:5000/api/servo/status
```

**Response (200 OK):**
```json
{
  "timestamp": "2026-04-07T10:42:45.000Z",
  "gates": {
    "GATE_IN": {
      "gate_id": 1,
      "gate_type": "GATE_IN",
      "current_position": 90,
      "is_open": true,
      "last_action": "OPEN",
      "last_action_time": "2026-04-07T10:30:00.000Z",
      "total_operations": 125,
      "updated_at": "2026-04-07T10:30:00.000Z"
    },
    "GATE_OUT": {
      "gate_id": 2,
      "gate_type": "GATE_OUT",
      "current_position": 0,
      "is_open": false,
      "last_action": "CLOSE",
      "last_action_time": "2026-04-07T10:25:00.000Z",
      "total_operations": 118,
      "updated_at": "2026-04-07T10:25:00.000Z"
    }
  },
  "message": "Current servo status"
}
```

---

### GET `/api/servo/history`
Get servo event history with optional filtering.

**Request:**
```
GET http://localhost:5000/api/servo/history?limit=50&gate_type=GATE_IN
```

**Query Parameters:**
- `limit` (integer, optional): Number of events to return (default: 100)
- `gate_type` (string, optional): Filter by gate - `GATE_IN` or `GATE_OUT`

**Response (200 OK):**
```json
{
  "total_events": 50,
  "limit": 50,
  "gate_type": "GATE_IN",
  "events": [
    {
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "gate_type": "GATE_IN",
      "action": "OPEN",
      "status": "SUCCESS",
      "servo_angle": 90,
      "timestamp": "2026-04-07T10:30:00.000Z"
    },
    {
      "event_id": "550e8400-e29b-41d4-a716-446655440001",
      "gate_type": "GATE_IN",
      "action": "CLOSE",
      "status": "SUCCESS",
      "servo_angle": 0,
      "timestamp": "2026-04-07T10:30:05.000Z"
    }
  ],
  "timestamp": "2026-04-07T10:42:45.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid gate_type parameter

---

### GET `/api/servo/statistics`
Get servo operation statistics for a period.

**Request:**
```
GET http://localhost:5000/api/servo/statistics?period=daily
```

**Query Parameters:**
- `period` (string, optional): Statistics period - `daily`, `weekly`, or `monthly` (default: daily)

**Response (200 OK):**
```json
{
  "period": "daily",
  "timestamp": "2026-04-07T10:42:45.000Z",
  "statistics": [
    {
      "gate_type": "GATE_IN",
      "action": "OPEN",
      "count": 45,
      "first_action": "2026-04-07T06:30:00.000Z",
      "last_action": "2026-04-07T10:30:00.000Z"
    },
    {
      "gate_type": "GATE_IN",
      "action": "CLOSE",
      "count": 45,
      "first_action": "2026-04-07T06:30:05.000Z",
      "last_action": "2026-04-07T10:30:05.000Z"
    }
  ],
  "message": "Servo event statistics"
}
```

---

## Parking Slots Endpoints

### POST `/api/slots/update`
Update parking slot occupancy status for all slots.

**Request:**
```json
{
  "parking_slots": [false, true, false, false, true, false],
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

**Parameters:**
- `parking_slots` (array, required): Array of 6 booleans, where:
  - `true` = occupied
  - `false` = available
- `timestamp` (ISO 8601, optional): Update time

**Response (200 OK):**
```json
{
  "status": "OK",
  "message": "Slots updated successfully",
  "slots_updated": 6,
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid or missing parking_slots array
- `500 Internal Server Error`: Database error

---

### GET `/api/slots`
Get current status of all parking slots.

**Request:**
```
GET http://localhost:5000/api/slots
```

**Response (200 OK):**
```json
{
  "total_slots": 6,
  "occupied_slots": 3,
  "available_slots": 3,
  "slots": [
    {
      "slot_id": 1,
      "is_occupied": false,
      "updated_at": "2026-04-07T10:30:00.000Z"
    },
    {
      "slot_id": 2,
      "is_occupied": true,
      "updated_at": "2026-04-07T10:28:30.000Z"
    },
    {
      "slot_id": 3,
      "is_occupied": false,
      "updated_at": "2026-04-07T10:29:15.000Z"
    },
    {
      "slot_id": 4,
      "is_occupied": false,
      "updated_at": "2026-04-07T10:30:00.000Z"
    },
    {
      "slot_id": 5,
      "is_occupied": true,
      "updated_at": "2026-04-07T10:27:45.000Z"
    },
    {
      "slot_id": 6,
      "is_occupied": false,
      "updated_at": "2026-04-07T10:30:00.000Z"
    }
  ],
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

---

## Error Handling

All errors follow standard HTTP status codes:

| Status Code | Meaning |
|------------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input or missing required parameters |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource conflict (e.g., vehicle already inside) |
| 500 | Internal Server Error - Database or server error |

### Standard Error Response:
```json
{
  "error": "Error message description"
}
```

---

## Constants

**Parking Fee:**
- Rate: 50,000 VND per hour
- Minimum charge: 1 hour (rounded up)

**Grace Period:**
- 5 minutes (not currently enforced in API)

**Parking Slots:**
- Total slots: 6
- Identified by: slot_id (1-6)

---

## Database Schema (Reference)

### Main Tables Used:
- `vehicles_log` - Vehicle entry/exit records
- `parking_slots` - Parking slot status
- `servo_events` - Servo gate events
- `servo_status` - Current servo gate status
- `alarm_logs` - Alarm event logs
- `users` - User account information
- `transaction_history` - Payment transaction records

---

## Development Notes

- All timestamps use ISO 8601 format (UTC)
- Database ACID transactions ensure data integrity
- RFID UID is the primary identifier for vehicles
- Payment is automatically processed on vehicle exit
- Both gates (GATE_IN and GATE_OUT) can be monitored independently
