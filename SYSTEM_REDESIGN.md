# Smart Parking System - Bluetooth-Only Redesign Documentation

## 📋 Overview

**Migration from RFID-based authentication to Bluetooth-only servo control system.**

This document describes the complete redesign of the smart parking system, removing RFID card readers entirely and implementing a Bluetooth-controlled gate system with ESP32 server notification.

---

## 🎯 System Architecture

### OLD SYSTEM (RFID-Based)
```
┌──────────────┐     ┌────────────────┐     ┌──────────┐     ┌──────────┐
│ RFID Scan    │────▶│ Arduino Mega   │────▶│ ESP32    │────▶│ Server   │
│ (User Card)  │     │ (FreeRTOS8 in  │     │ (WiFi)   │     │ (DB)     │
└──────────────┘     │  out gates)    │     └──────────┘     └──────────┘
                     │                │
                     │ Tasks:         │
                     │ - TaskRFID     │
                     │ - TaskGate     │
                     │ - TaskLCD      │
                     │ - TaskAlarm    │
                     │ - TaskComESP32 │
                     └────────────────┘
```

### NEW SYSTEM (Bluetooth-Only)
```
┌────────────────┐   ┌──────────────────────┐   ┌──────────┐   ┌──────────┐
│ Bluetooth      │   │ Arduino Mega         │   │ ESP32    │   │ Server   │
│ Phone App      │──▶│ (FreeRTOS - 4 tasks) │──▶│ (WiFi)   │──▶│ (DB)     │
│ (1-4, S, ?)    │   │                      │   │          │   │          │
└────────────────┘   │ Tasks:               │   └──────────┘   └──────────┘
                     │ - TaskBluetooth      │
                     │ - TaskGateControl    │
                     │ - TaskComESP32       │
                     │ - TaskAlarm (future) │
                     │                      │
                     │ Removed:             │
                     │ - TaskRFID (SPI)     │
                     │ - TaskParkingSensor  │
                     │ - TaskLCD (optional) │
                     │ - TaskButtonHandler  │
                     └──────────────────────┘
```

---

## 🔧 Hardware Configuration

### Remains Unchanged
All physical pins and connections remain the same:

| Component | Pin(s) | Protocol | Baud Rate | Status |
|-----------|--------|----------|-----------|--------|
| **Servo IN** | 2 (PWM) | - | - | ✅ Active |
| **Servo OUT** | 3 (PWM) | - | - | ✅ Active |
| **Bluetooth HC-05** | 14/15 (Serial3) | UART | 9600 | ✅ Active |
| **ESP32 Gateway** | 18/19 (Serial1) | UART | 19200 | ✅ Active |
| **LCD I2C** | 20/21 (I2C) | I2C | - | ⏸️ Unused (kept) |
| **IR Sensors** | A0-A5 | Analog | - | ⏸️ Unused (kept) |
| **Smoke Sensor** | A8 | Analog | - | ⏸️ Unused (kept) |
| **Flame Sensor** | 22 (Digital) | Digital | - | ⏸️ Unused (kept) |
| **Buttons** | 25/26/27 | Digital | - | ⏸️ Unused (kept) |
| **Buzzer** | 24 (PWM) | - | - | ⏸️ Unused (kept) |

---

## 📡 Communication Protocols

### 1. Bluetooth Command Format (9600 baud)
**Direction:** Phone → Arduino (Serial3)

```
Command | Action
--------|---------------------------
1       | Open GATE_IN (servo→90°)
2       | Close GATE_IN (servo→0°)
3       | Open GATE_OUT (servo→90°)
4       | Close GATE_OUT (servo→0°)
S       | Request system status
?       | Help menu
```

**Example Bluetooth Terminal Output:**
```
[GATE_IN] Opening
[GATE_IN] Closing
[GATE_OUT] Opening
[GATE_OUT] Closing
[BT] Received: 1
========== SYSTEM STATUS ==========
Uptime: 3600 seconds
GATE_IN position: 90°
GATE_OUT position: 0°
Total operations: 12
====================================
```

### 2. Arduino-to-ESP32 Message Format (19200 baud)
**Direction:** Arduino → ESP32 (Serial1)

```
$GATE_TYPE|ACTION|ANGLE|TIMESTAMP\n

Example:
$GATE_IN|OPEN|90|5234
$GATE_OUT|CLOSE|0|5345
```

**Field Breakdown:**
- `$` = Message start marker
- `GATE_TYPE` = "GATE_IN" or "GATE_OUT"
- `ACTION` = "OPEN" or "CLOSE"
- `ANGLE` = Servo angle (0-180)
- `TIMESTAMP` = Arduino uptime in seconds
- `\n` = Message end (newline)

### 3. ESP32-to-Server Message Format (HTTP POST)
**Direction:** ESP32 → Server (WiFi)

**Endpoint:** `http://<SERVER_IP>:5000/api/servo/open` or `/api/servo/close`

**Request Body (JSON):**
```json
{
  "gate_type": "GATE_IN",
  "servo_angle": 90,
  "timestamp": 1703001234
}
```

**Response (201 Created):**
```json
{
  "event_id": "uuid-string",
  "gate_type": "GATE_IN",
  "action": "OPEN",
  "servo_angle": 90,
  "status": "SUCCESS",
  "timestamp": "2024-01-20T10:15:30.000Z",
  "message": "Servo open event recorded"
}
```

---

## 💾 Database Schema Changes

### OLD SCHEMA (REMOVED)
```sql
users:
  - user_id (PK)
  - rfid_uid (UNIQUE) ❌
  - full_name
  - phone_number
  - account_balance
  
rfid_cards: ❌
  - card_id (PK)
  - rfid_uid
  - user_id (FK)
  
vehicles_log: ❌
  - vehicle_id (PK)
  - rfid_uid ❌
  - entry_time
  - exit_time
  - payment_status
  - duration_minutes
```

### NEW SCHEMA (ADDED)
```sql
servo_events: ✅ NEW
  - event_id (PK)
  - gate_type: TEXT ('GATE_IN', 'GATE_OUT')
  - action: TEXT ('OPEN', 'CLOSE')
  - status: TEXT ('SUCCESS', 'FAILED')
  - servo_angle: INTEGER (0-180)
  - timestamp: DATETIME
  - created_at: DATETIME
  
servo_status: ✅ NEW
  - gate_id (PK)
  - gate_type: TEXT UNIQUE ('GATE_IN', 'GATE_OUT')
  - current_position: INTEGER (0-180)
  - is_open: INTEGER (0 or 1)
  - last_action: TEXT
  - last_action_time: DATETIME
  - total_operations: INTEGER
  - updated_at: DATETIME
  
alarm_logs: ⏸️ KEPT
  (for future smoke/flame detection)
  
parking_slots: ⏸️ KEPT
  (for future occupancy tracking)
```

### Database Migration Steps

1. **Backup old database:**
   ```bash
   cp server/database/parking_system.db server/database/parking_system.db.backup
   ```

2. **Replace db.js with new version:**
   ```bash
   cp server/database/db_new.js server/database/db.js
   ```

3. **Server will auto-create new tables on startup**
   (via `initializeDatabase()` function)

---

## 📦 File Changes

### New Files Created
| File | Purpose |
|------|---------|
| `arduino_parking_bluetooth_only.ino` | Simplified Arduino code (4 tasks) |
| `esp32_gateway_bluetooth_only.ino` | New ESP32 code for servo events |
| `server_bluetooth_only.js` | Updated server with servo routes |
| `servoRoutes.js` | New Express routes for servo events |
| `db_new.js` | New database schema (no RFID) |
| `SYSTEM_REDESIGN.md` | This document |

### Files to Update (in your production)
1. Backup originals:
   ```bash
   cp arduino_parking_freertos.ino arduino_parking_freertos.ino.backup
   cp esp32_gateway.ino esp32_gateway.ino.backup
   cp server/database/db.js server/database/db.js.backup
   cp server/server.js server/server.js.backup
   ```

2. Replace with new versions:
   ```bash
   cp arduino_parking_bluetooth_only.ino arduino/arduino_parking_freertos/arduino_parking_freertos.ino
   cp esp32_gateway_bluetooth_only.ino esp32/esp32_gateway/esp32_gateway.ino
   cp server_bluetooth_only.js server/server.js
   cp db_new.js server/database/db.js
   ```

3. Add new servlet routes:
   ```bash
   cp servoRoutes.js server/routes/servoRoutes.js
   ```

---

## 🚀 Implementation Workflow

### Step 1: Update Arduino Code
1. **Backup original:** `arduino_parking_freertos.ino.backup`
2. **Upload new code:** `arduino_parking_bluetooth_only.ino`
3. **Verify compilation:** No errors, size ~25KB
4. **Test:** Connect via Bluetooth terminal, test commands 1-4, S, ?

**Expected Serial Output:**
```
========================================
SMART PARKING SYSTEM - START UP
Bluetooth-Only Servo Control
========================================

[SETUP] Servos initialized
[SETUP] Bluetooth initialized at 9600 baud
[SETUP] ESP32 communication initialized at 19200 baud
[SETUP] All tasks created. System ready!
```

### Step 2: Update ESP32 Code
1. **Backup original:** `esp32_gateway.ino.backup`
2. **Update WiFi credentials** in code (lines ~60-62)
3. **Update server IP** in code (line ~66)
4. **Upload new code:** `esp32_gateway_bluetooth_only.ino`
5. **Verify:** Serial monitor shows WiFi connected

**Expected Serial Output:**
```
========================================
ESP32 PARKING GATEWAY - START UP
Servo Event Relay Version
========================================

[SETUP] UART2 initialized at 19200 baud
[WiFi] Connecting to: M9IP
[WiFi] Connected!
[WiFi] IP Address: 192.168.x.x
[GATEWAY] System ready! Waiting for servo events...
```

### Step 3: Update Server Code
1. **Backup database:** `parking_system.db.backup`
2. **Replace files:**
   - `server/server.js` ← `server_bluetooth_only.js`
   - `server/database/db.js` ← `db_new.js`
   - `server/routes/servoRoutes.js` ← (new file)

3. **Restart Node server:**
   ```bash
   npm install  # If needed
   npm start    # or: node server.js
   ```

4. **Expected console output:**
   ```
   ========================================
   🚀 SMART PARKING SERVER STARTED
   ========================================
   Port: 5000
   Host: 0.0.0.0
   
   📡 API Endpoints:
     GET  /health
     GET  /api/system/status
     POST /api/servo/open
     POST /api/servo/close
     GET  /api/servo/status
     GET  /api/servo/history
     GET  /api/servo/statistics
     ========================================
   ```

---

## 🧪 Testing Procedure

### Test 1: Bluetooth Control ✅
**Tool:** Serial Bluetooth Terminal app (Android) or similar

1. Pair HC-05 module:
   - Device name: "HC-05"
   - PIN: "1234" (default)
2. Connect to HC-05
3. Send commands and verify servo moves:
   ```
   Command → Expected Result
   1        → GATE_IN servo moves to 90°
   2        → GATE_IN servo moves to 0°
   3        → GATE_OUT servo moves to 90°
   4        → GATE_OUT servo moves to 0°
   S        → Display system status
   ?        → Display help menu
   ```

### Test 2: ESP32 UART Communication ✅
**Tool:** Arduino Serial Monitor (monitor ESP32 RX/TX)

1. Upload Arduino code
2. Upload ESP32 code
3. Open Arduino Serial Monitor (both boards at their respective baud rates)
4. Send Bluetooth command on Arduino
5. Verify message appears on ESP32 serial:
   ```
   [UART] Received: GATE_IN|OPEN|90|1234
   [PARSE] Gate: GATE_IN, Action: OPEN, Angle: 90, Timestamp: 1234
   ```

### Test 3: Server API ✅
**Tool:** curl, Postman, or REST client

1. Check server health:
   ```bash
   curl http://localhost:5000/health
   # Response: {"status":"OK","timestamp":"...","uptime":...}
   ```

2. Get system status:
   ```bash
   curl http://localhost:5000/api/system/status
   # Response: {status, total_servo_events, gates, alarms}
   ```

3. Test servo open endpoint:
   ```bash
   curl -X POST http://localhost:5000/api/servo/open \
     -H "Content-Type: application/json" \
     -d '{"gate_type":"GATE_IN","servo_angle":90}'
   # Response: 201 Created with event_id
   ```

4. Get servo status:
   ```bash
   curl http://localhost:5000/api/servo/status
   # Response: {gates: {GATE_IN: {...}, GATE_OUT: {...}}}
   ```

5. Get servo history:
   ```bash
   curl http://localhost:5000/api/servo/history?limit=10
   # Response: {count, events: [...]}
   ```

### Test 4: End-to-End Integration ✅
**Complete workflow:**

1. Start all three components:
   - Arduino with `arduino_parking_bluetooth_only.ino`
   - ESP32 with `esp32_gateway_bluetooth_only.ino`
   - Node.js server with `server_bluetooth_only.js`

2. Use Bluetooth app to send command "1"

3. Verify complete chain:
   ```
   Bluetooth App (1)
   ↓
   Arduino Serial3 receives "1"
   ↓
   TaskBluetooth processes command
   ↓
   TaskGateControl moves GATE_IN servo to 90°
   ↓
   TaskComESP32 queues servo event
   ↓
   ESP32 Serial1 receives: "$GATE_IN|OPEN|90|1234"
   ↓
   ESP32 parses message and validates
   ↓
   ESP32 HTTP POST to server: /api/servo/open
   ↓
   Server receives, creates servo_events DB entry
   ↓
   Server response 201 Created with event_id
   ↓
   Database updated: servo_events table has new record
   ↓
   Verify with: curl http://localhost:5000/api/servo/history
   ```

---

## 📊 Database Queries

### View all servo events:
```sql
SELECT * FROM servo_events ORDER BY timestamp DESC LIMIT 20;
```

### Check gate status:
```sql
SELECT * FROM servo_status;
```

### Daily summary:
```sql
SELECT gate_type, action, COUNT(*) as count 
FROM servo_events 
WHERE DATE(timestamp) = DATE('now') 
GROUP BY gate_type, action;
```

### Total operations per gate:
```sql
SELECT gate_type, SUM(total_operations) as total 
FROM servo_status 
GROUP BY gate_type;
```

---

## ⚠️ Important Notes

### REMOVED Concepts
- ❌ RFID module support (RC522)
- ❌ User authentication via RFID cards
- ❌ Vehicle entry/exit workflows
- ❌ Parking fees & payment tracking
- ❌ RFID task (`TaskRFID`)
- ❌ Parking sensor task (`TaskParkingSensor`)
- ❌ Button handler task (`TaskButtonHandler`)

### KEPT for Compatibility
- ✅ Hardware connections (no rewiring needed)
- ✅ LCD I2C pins 20/21 (kept but unused)
- ✅ IR sensors A0-A5 (kept but unused)
- ✅ Smoke sensor A8 (kept but unused)
- ✅ Flame sensor pin 22 (kept but unused)
- ✅ Buttons pins 25/26/27 (kept but unused)
- ✅ Buzzer pin 24 (kept but unused)

### Future Expansion
The system is designed for easy expansion:
- Add LCD display task (reuse TaskLCD code)
- Add IR sensor monitoring (reuse TaskParkingSensor)
- Add smoke/flame alert (reuse TaskAlarm)
- Add web dashboard (use servo history API)

---

## 🆘 Troubleshooting

### Issue: Bluetooth not receiving commands
**Solution:**
1. Check HC-05 baud rate (must be 9600)
2. Verify pin 14/15 connections to Serial3
3. Test with Serial Bluetooth Terminal app
4. Check Arduino LED - should blink on successful connection

### Issue: ESP32 not receiving Arduino messages
**Solution:**
1. Check UART baud rate (must be 19200)
2. Verify pin 18/19 connections to Serial1
3. Check Arduino serial output (Serial.println) for "$GATE_..." messages
4. Use oscilloscope to verify TX signal on pin 19

### Issue: Server not receiving events
**Solution:**
1. Check ESP32 WiFi connection (`curl ESP32_IP/health`)
2. Verify server IP address in ESP32 code
3. Check firewall allows port 5000
4. Monitor server logs for incoming HTTP requests
5. Test API directly: `curl -X POST http://localhost:5000/api/servo/open -H "Content-Type: application/json" -d '{"gate_type":"GATE_IN","servo_angle":90}'`

### Issue: Servo not moving
**Solution:**
1. Check power supply to servo (5V available?)
2. Verify pin 2/3 are PWM pins
3. Test servo directly with Arduino Servo example
4. Check FreeRTOS task priority (TaskGateControl should be priority ≥2)

---

## 📝 Configuration Files

### Arduino Code Configuration
**File:** `arduino_parking_bluetooth_only.ino` (lines 55-62)
```cpp
#define SERVO_OPEN_ANGLE 90      // Can adjust if needed
#define SERVO_CLOSE_ANGLE 0      // Can adjust if needed
#define SERVO_MOVE_DELAY 500     // Increase if servo too slow
#define BLUETOOTH_BAUD 9600      // Must match HC-05
#define ESP32_BAUD 19200         // Must match ESP32
```

### ESP32 Code Configuration
**File:** `esp32_gateway_bluetooth_only.ino` (lines 60-67)
```cpp
const char* SSID = "M9IP";                           // Your WiFi SSID
const char* PASSWORD = "chien123";                   // Your WiFi password
const char* SERVER_URL = "http://172.20.10.5:5000"; // Your server IP:port
```

### Server Configuration
**File:** `server_bluetooth_only.js` (lines 51-53)
```javascript
const PORT = 5000;
const HOST = '0.0.0.0';
```

---

## 📞 Support & Next Steps

### Immediate Actions
1. [ ] Backup all original files (*.backup)
2. [ ] Test Arduino code alone (Bluetooth commands)
3. [ ] Test ESP32 code with Arduino (UART messages)
4. [ ] Test server API (curl requests)
5. [ ] Run end-to-end integration test

### Future Enhancements
- [ ] Add web dashboard for live servo monitoring
- [ ] Implement servo position feedback sensors
- [ ] Add rate limiting for rapid commands
- [ ] Create mobile app (iOS/Android) for better control
- [ ] Add scheduled gate opening (e.g., auto-open at 6 AM)
- [ ] Implement motion detection for automatic exit
- [ ] Add email/SMS alerts for suspicious activity

---

**Document Version:** 1.0  
**Created:** 2024-01-20  
**System Version:** Bluetooth-Only Servo Control v1.0  
**Status:** ✅ Ready for Deployment
