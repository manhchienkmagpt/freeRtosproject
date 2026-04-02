# SMART PARKING API DOCUMENTATION
## Complete REST API Reference

---

## 📌 BASE URL
```
http://localhost:5000
```

## 📋 TABLE OF CONTENTS
1. [Health & Status](#health--status)
2. [Vehicle Management](#vehicle-management)
3. [Parking Status](#parking-status)
4. [Alarm Management](#alarm-management)
5. [Statistics](#statistics)
6. [Request/Response Examples](#requestresponse-examples)

---

## 🏥 HEALTH & STATUS

### **GET /health**
Check if server is running.

**Request:**
```http
GET /health
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2024-03-24T10:00:00.000Z",
  "uptime": 45.234
}
```

---

### **GET /api/system/status**
Get complete system status and statistics.

**Request:**
```http
GET /api/system/status
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2024-03-24T10:00:00.000Z",
  "total_vehicles_processed": 1250,
  "occupied_slots": 3,
  "total_available_slots": 6,
  "total_revenue": 62500000,
  "uptime_seconds": 85430
}
```

---

## 🚗 VEHICLE MANAGEMENT

### **POST /api/vehicle/enter**
Record a vehicle entering the parking lot.

**Request:**
```http
POST /api/vehicle/enter
Content-Type: application/json

{
  "rfid_uid": "04A1B2C3",
  "timestamp": 1711260000000,
  "parking_slots": [0, 0, 1, 0, 0, 1]
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rfid_uid | string | Yes | RFID card UID (8 chars) |
| timestamp | number | No | Unix timestamp (ms), default: now |
| parking_slots | array | No | Occupancy status [6 slots] |

**Response (201 Created):**
```json
{
  "vehicle_id": "123e4567-e89b-12d3-a456-426614174000",
  "rfid_uid": "04A1B2C3",
  "user_id": "U001",
  "user_name": "Nguyễn Văn A",
  "entry_time": "2024-03-24T10:00:00Z",
  "status": "Entry recorded",
  "timestamp": "2024-03-24T10:00:00Z"
}
```

**Error Response (409):**
```json
{
  "error": "Vehicle already inside the parking",
  "vehicle_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

---

### **POST /api/vehicle/exit**
Record a vehicle exiting and process payment.

**Request:**
```http
POST /api/vehicle/exit
Content-Type: application/json

{
  "rfid_uid": "04A1B2C3",
  "timestamp": 1711263600000,
  "parking_slots": [0, 0, 0, 0, 0, 1]
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rfid_uid | string | Yes | RFID card UID |
| timestamp | number | No | Exit time (Unix ms), default: now |
| parking_slots | array | No | Current slot status |

**Response (200 OK):**
```json
{
  "vehicle_id": "123e4567-e89b-12d3-a456-426614174000",
  "rfid_uid": "04A1B2C3",
  "entry_time": "2024-03-24T10:00:00Z",
  "exit_time": "2024-03-24T11:00:00Z",
  "duration_minutes": 60,
  "duration_hours": 1,
  "payment_amount": 50000,
  "payment_status": "completed",
  "transaction_id": "txn-uuid",
  "message": "Payment completed",
  "timestamp": "2024-03-24T11:00:00Z"
}
```

**Payment Status Values:**
- `completed`: Payment successful (balance >= amount)
- `failed`: Insufficient balance
- `pending`: Payment awaiting confirmation

---

### **GET /api/vehicle/:rfid_uid**
Get details of the most recent vehicle entry for an RFID card.

**Request:**
```http
GET /api/vehicle/04A1B2C3
```

**Response (200 OK):**
```json
{
  "vehicle": {
    "vehicle_id": "123e4567-e89b-12d3-a456-426614174000",
    "rfid_uid": "04A1B2C3",
    "user_id": "U001",
    "entry_time": "2024-03-24T10:00:00Z",
    "exit_time": null,
    "entry_gate": "main",
    "duration_minutes": null,
    "payment_amount": null,
    "payment_status": "pending"
  },
  "timestamp": "2024-03-24T10:15:00Z"
}
```

---

### **GET /api/vehicles**
List all vehicles with pagination.

**Request:**
```http
GET /api/vehicles?page=1&limit=20
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number (1-indexed) |
| limit | integer | 20 | Items per page (max 100) |

**Response (200 OK):**
```json
{
  "page": 1,
  "limit": 20,
  "total": 1250,
  "total_pages": 63,
  "vehicles": [
    {
      "vehicle_id": "123e4567-e89b-12d3-a456-426614174000",
      "rfid_uid": "04A1B2C3",
      "user_id": "U001",
      "entry_time": "2024-03-24T10:00:00Z",
      "exit_time": "2024-03-24T11:00:00Z",
      "duration_minutes": 60,
      "payment_amount": 50000,
      "payment_status": "completed"
    }
  ],
  "timestamp": "2024-03-24T10:15:00Z"
}
```

---

### **GET /api/vehicle/history/:user_id**
Get vehicle history for a specific user.

**Request:**
```http
GET /api/vehicle/history/U001?days=30
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| user_id | string | - | User ID |
| days | integer | 30 | Days back to look (max 365) |

**Response (200 OK):**
```json
{
  "user_id": "U001",
  "days": 30,
  "total_visits": 12,
  "total_spent": 600000,
  "vehicles": [
    {
      "vehicle_id": "123e4567-e89b-12d3-a456-426614174000",
      "entry_time": "2024-03-20T10:00:00Z",
      "exit_time": "2024-03-20T11:30:00Z",
      "duration_minutes": 90,
      "payment_amount": 75000,
      "payment_status": "completed"
    }
  ],
  "timestamp": "2024-03-24T10:15:00Z"
}
```

---

## 🅿️ PARKING STATUS

### **GET /api/parking-status**
Get real-time parking lot status.

**Request:**
```http
GET /api/parking-status
```

**Response (200 OK):**
```json
{
  "total_slots": 6,
  "occupied_slots": 3,
  "available_slots": 3,
  "occupancy_percentage": 50,
  "slots": [
    {
      "slot_id": 1,
      "is_occupied": 0
    },
    {
      "slot_id": 2,
      "is_occupied": 1
    },
    {
      "slot_id": 3,
      "is_occupied": 1
    },
    {
      "slot_id": 4,
      "is_occupied": 0
    },
    {
      "slot_id": 5,
      "is_occupied": 1
    },
    {
      "slot_id": 6,
      "is_occupied": 0
    }
  ],
  "timestamp": "2024-03-24T10:15:30.123Z"
}
```

---

## 🚨 ALARM MANAGEMENT

### **POST /api/alarm**
Log a fire/smoke alarm alert.

**Request:**
```http
POST /api/alarm
Content-Type: application/json

{
  "alarm_type": "smoke",
  "sensor_value": 450,
  "timestamp": 1711260000000
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| alarm_type | string | Yes | "smoke" or "flame" |
| sensor_value | number | No | Sensor reading (MQ-2 output) |
| timestamp | number | No | Alarm time (Unix ms) |

**Response (201 Created):**
```json
{
  "alarm_id": "alarm-uuid",
  "alarm_type": "smoke",
  "sensor_value": 450,
  "severity": "high",
  "status": "Alert received and logged",
  "timestamp": "2024-03-24T10:30:00Z"
}
```

**Severity Levels:**
- `critical`: Flame detected or very high smoke (> 600)
- `high`: High smoke (> 500)
- `medium`: Medium smoke (> 400)
- `low`: Low smoke (< 400)

---

### **GET /api/alarm/active**
Get all unresolved alarms.

**Request:**
```http
GET /api/alarm/active
```

**Response (200 OK):**
```json
{
  "active_alarms": 2,
  "alarms": [
    {
      "alarm_id": "alarm-uuid",
      "alarm_type": "smoke",
      "sensor_type": "MQ2_SMOKE",
      "sensor_value": 450,
      "alarm_time": "2024-03-24T10:30:00Z",
      "severity": "high",
      "resolved": false
    },
    {
      "alarm_id": "alarm-uuid2",
      "alarm_type": "flame",
      "sensor_type": "FLAME_SENSOR",
      "alarm_time": "2024-03-24T10:35:00Z",
      "severity": "critical",
      "resolved": false
    }
  ],
  "timestamp": "2024-03-24T10:40:00Z"
}
```

---

### **GET /api/alarm/recent**
Get recent alarms within a time period.

**Request:**
```http
GET /api/alarm/recent?hours=24
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| hours | integer | 24 | Hours back to look |

**Response (200 OK):**
```json
{
  "period_hours": 24,
  "statistics": {
    "total": 5,
    "smoke_alarms": 3,
    "flame_alarms": 2,
    "resolved": 4,
    "unresolved": 1
  },
  "alarms": [
    {
      "alarm_id": "alarm-uuid",
      "alarm_type": "smoke",
      "severity": "high",
      "alarm_time": "2024-03-24T10:30:00Z",
      "resolved": true,
      "resolved_time": "2024-03-24T10:35:00Z"
    }
  ],
  "timestamp": "2024-03-24T10:40:00Z"
}
```

---

### **PUT /api/alarm/:alarm_id/resolve**
Mark an alarm as resolved.

**Request:**
```http
PUT /api/alarm/alarm-uuid/resolve
Content-Type: application/json

{
  "action_taken": "Extinguished fire",
  "resolved_by": "Admin",
  "notes": "False alarm - cooking activity"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action_taken | string | No | Action description |
| resolved_by | string | No | Who resolved it |
| notes | string | No | Additional notes |

**Response (200 OK):**
```json
{
  "alarm_id": "alarm-uuid",
  "status": "Resolved",
  "resolved_at": "2024-03-24T10:35:00Z"
}
```

---

### **GET /api/alarm/daily-summary**
Get daily alarm summary.

**Request:**
```http
GET /api/alarm/daily-summary?date=2024-03-24
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| date | string | today | Date (YYYY-MM-DD) |

**Response (200 OK):**
```json
{
  "date": "2024-03-24",
  "total_alarms": 5,
  "summary": [
    {
      "alarm_type": "smoke",
      "severity": "high",
      "count": 3
    },
    {
      "alarm_type": "flame",
      "severity": "critical",
      "count": 2
    }
  ],
  "alarms": [
    {
      "alarm_id": "alarm-uuid",
      "alarm_type": "smoke",
      "severity": "high",
      "alarm_time": "2024-03-24T10:30:00Z",
      "resolved": true
    }
  ],
  "timestamp": "2024-03-24T10:40:00Z"
}
```

---

## 📊 STATISTICS

### **GET /api/statistics/daily**
Get daily statistics.

**Request:**
```http
GET /api/statistics/daily
```

**Response (200 OK):**
```json
{
  "date": "2024-03-24",
  "vehicles_count": 45,
  "revenue": 2250000,
  "avg_duration_minutes": 65,
  "first_entry": "2024-03-24T06:30:00Z",
  "last_exit": "2024-03-24T22:15:00Z",
  "timestamp": "2024-03-24T22:30:00Z"
}
```

---

### **GET /api/statistics/hourly**
Get hourly statistics for the day.

**Request:**
```http
GET /api/statistics/hourly
```

**Response (200 OK):**
```json
{
  "date": "2024-03-24",
  "hourly_data": [
    {
      "hour": "06",
      "vehicles_count": 3,
      "revenue": 150000
    },
    {
      "hour": "07",
      "vehicles_count": 8,
      "revenue": 450000
    }
  ],
  "timestamp": "2024-03-24T22:30:00Z"
}
```

---

## 📝 REQUEST/RESPONSE EXAMPLES

### **Example 1: Full Vehicle Lifecycle**

#### Step 1: Vehicle Enters
```bash
curl -X POST http://localhost:5000/api/vehicle/enter \
  -H "Content-Type: application/json" \
  -d '{
    "rfid_uid": "04A1B2C3",
    "parking_slots": [0,0,1,0,0,1]
  }'
```

Response:
```json
{
  "vehicle_id": "v-001",
  "status": "Entry recorded"
}
```

#### Step 2: Check Parking Status
```bash
curl http://localhost:5000/api/parking-status
```

Response shows 2 occupied slots

#### Step 3: Vehicle Exits
```bash
curl -X POST http://localhost:5000/api/vehicle/exit \
  -H "Content-Type: application/json" \
  -d '{
    "rfid_uid": "04A1B2C3"
  }'
```

Response:
```json
{
  "payment_amount": 50000,
  "payment_status": "completed"
}
```

---

### **Example 2: Alarm Response**

#### Report Alarm
```bash
curl -X POST http://localhost:5000/api/alarm \
  -H "Content-Type: application/json" \
  -d '{
    "alarm_type": "smoke",
    "sensor_value": 450
  }'
```

#### Check Active Alarms
```bash
curl http://localhost:5000/api/alarm/active
```

#### Resolve Alarm
```bash
curl -X PUT http://localhost:5000/api/alarm/alarm-uuid/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "action_taken": "Manual inspection",
    "resolved_by": "Admin"
  }'
```

---

## ❌ ERROR RESPONSES

### **400 Bad Request**
```json
{
  "error": "RFID UID is required"
}
```

### **404 Not Found**
```json
{
  "error": "No active vehicle entry found"
}
```

### **409 Conflict**
```json
{
  "error": "Vehicle already inside the parking"
}
```

### **500 Internal Server Error**
```json
{
  "error": "Database error message"
}
```

---

## 📌 HTTP STATUS CODES

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (new resource) |
| 400 | Bad Request (invalid input) |
| 404 | Not Found (resource doesn't exist) |
| 409 | Conflict (data conflict) |
| 500 | Server Error |

---

## 🔐 AUTHENTICATION (Future Enhancement)

When implementing API key authentication:
```http
GET /api/vehicles
Authorization: Bearer YOUR_API_KEY
```

---

**API Version: 1.0.0**  
**Last Updated: 2024-03-24**

