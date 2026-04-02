# Integration Testing Guide - Bluetooth-Only System

## 🧪 Quick Testing Checklist

This guide provides step-by-step instructions to test the complete Bluetooth-only system.

---

## Phase 1: Individual Component Testing (Each in Isolation)

### Test 1.1: Arduino Bluetooth Control
**Goal:** Verify Arduino receives Bluetooth commands and controls servos

**Components Needed:**
- Arduino Mega 2560 with `arduino_parking_bluetooth_only.ino`
- HC-05 Bluetooth module (paired)
- 2x SG90 Servo motors on pins 2, 3
- Bluetooth Serial Terminal app (Android/iOS)
- USB cable to power Arduino

**Steps:**
1. Upload `arduino_parking_bluetooth_only.ino` to Arduino
2. Open Serial Monitor (115200 baud) - should see:
   ```
   SMART PARKING SYSTEM - START UP
   [SETUP] Servos initialized
   [SETUP] All tasks created. System ready!
   ```
3. Open Bluetooth Serial Terminal app
4. Pair and connect to HC-05 (PIN: 1234)
5. Send each command and observe:

| Command | Expected Response | Physical Observation |
|---------|-------------------|----------------------|
| `1` | `[GATE_IN] Opening` | GATE_IN servo rotates to 90° |
| `2` | `[GATE_IN] Closing` | GATE_IN servo rotates to 0° |
| `3` | `[GATE_OUT] Opening` | GATE_OUT servo rotates to 90° |
| `4` | `[GATE_OUT] Closing` | GATE_OUT servo rotates to 0° |
| `S` | Display status block | Shows positions and uptime |
| `?` | Show help menu | Lists all commands |

**Pass Criteria:** ✅
- [ ] All 6 commands produce expected output
- [ ] Servos move smoothly without stuttering
- [ ] No garbage characters in Bluetooth terminal
- [ ] Status message displays correctly

---

### Test 1.2: Arduino-to-ESP32 UART Communication
**Goal:** Verify Arduino sends servo events to ESP32

**Components Needed:**
- Arduino Mega with new code (from Test 1.1)
- ESP32 board with `esp32_gateway_bluetooth_only.ino` (WiFi code commented out temporarily)
- USB cables for both boards
- Two Serial Monitor windows

**Steps:**
1. Connect Arduino Serial1 (pins 18/19) to ESP32 Serial2 (pins 16/17)
   - Arduino TX1 (pin 18) → ESP32 RX2 (pin 16)
   - Arduino RX1 (pin 19) → ESP32 TX2 (pin 17)
   - GND → GND

2. Upload both codes to their respective boards

3. Open two Serial Monitor windows:
   - Window A: Arduino Serial (115200 baud)
   - Window B: ESP32 Serial (115200 baud)

4. Send Bluetooth command "1" from terminal
5. Observe both windows:
   - **Arduino (Window A):** `[GATE_IN] Opening`
   - **ESP32 (Window B):** `[UART] Received: GATE_IN|OPEN|90|1234`

6. Repeat with commands 2, 3, 4

**Pass Criteria:** ✅
- [ ] All messages successfully transmitted
- [ ] No garbled UART data
- [ ] Timestamps are reasonable (incrementing)
- [ ] Gate types and actions are correct

---

### Test 1.3: ESP32-to-Server HTTP Communication
**Goal:** Verify ESP32 successfully sends POST requests to server

**Components Needed:**
- ESP32 from Test 1.2
- Node.js server running (`npm start`)
- WiFi network (2.4GHz, no enterprise auth)
- curl for testing

**Steps:**
1. **Start the server:**
   ```bash
   cd server
   npm start
   ```
   (Should show: "🚀 SMART PARKING SERVER STARTED")

2. **Configure ESP32 WiFi credentials:**
   - Edit `esp32_gateway_bluetooth_only.ino` (lines ~60-62)
   - Set your WiFi SSID and password
   - Set server IP address
   - Recompile and upload

3. **Open ESP32 Serial Monitor (115200 baud)**
   - Should see: `[WiFi] Connected!`
   - Should show: `[GATEWAY] System ready!`

4. **Send UART message to ESP32:**
   - From Arduino Bluetooth: Send command "1"
   - In ESP32 Serial, observe:
     ```
     [UART] Received: GATE_IN|OPEN|90|1234
     [PARSE] Gate: GATE_IN, Action: OPEN, Angle: 90
     [HTTP] Connecting to: http://SERVER_IP:5000/api/servo/open
     [JSON] Payload: {"gate_type":"GATE_IN","servo_angle":90,"timestamp":1234}
     [HTTP] Response code: 201
     ```

5. **Verify server received the request:**
   ```bash
   curl http://localhost:5000/api/servo/history
   ```
   Should see the event in response

**Pass Criteria:** ✅
- [ ] ESP32 connects to WiFi successfully
- [ ] HTTP POST returns 201 status code
- [ ] No JSON parsing errors
- [ ] Server logs show incoming POST request
- [ ] Database has new servo_events entry

---

## Phase 2: Integration Testing

### Test 2.1: Complete System - Bluetooth to Database
**Goal:** End-to-end test of all components working together

**Components Needed:**
- Arduino with `arduino_parking_bluetooth_only.ino`
- ESP32 with `esp32_gateway_bluetooth_only.ino`
- Node.js server with new code
- Bluetooth Serial Terminal app
- curl or Postman for API testing

**Part A: Bluetooth → Arduino → ESP32**
1. Ensure Arduino and ESP32 UART connection is correct
2. Open Bluetooth Serial Terminal
3. Send command "1"
4. Verify in Arduino Serial Monitor:
   ```
   [BT] Received: 1
   [GATE_IN] Opening
   ```

**Part B: Arduino → ESP32 → Server**
1. Open ESP32 Serial Monitor
2. Should see UART message parsed
3. In server console, verify HTTP request logged:
   ```
   [timestamp] POST /api/servo/open
   ```

**Part C: Verify Database Entry**
1. Query database:
   ```bash
   curl http://localhost:5000/api/servo/history
   ```
2. Response should contain event with:
   - `gate_type: "GATE_IN"`
   - `action: "OPEN"`
   - `servo_angle: 90`

**Pass Criteria:** ✅
- [ ] Bluetooth command triggered servo movement
- [ ] UART message transmitted correctly
- [ ] HTTP request received by server (201 status)
- [ ] Database entry created with correct data
- [ ] API returns recent event in history

---

### Test 2.2: Rapid Command Sequence
**Goal:** Verify system handles rapid commands without data loss

**Steps:**
1. Send rapid Bluetooth commands in sequence: 1, 2, 3, 4, 1, 2, 3, 4
2. Observe:
   - Servos smoothly move between positions
   - No "queue full" errors
   - No UART data loss
   - Server receives all events

3. Verify database has all events:
   ```bash
   curl "http://localhost:5000/api/servo/history?limit=20"
   ```

**Pass Criteria:** ✅
- [ ] All 8 commands processed in order
- [ ] No events lost in queue
- [ ] All events stored in database
- [ ] Server response includes all events

---

### Test 2.3: System Status Query
**Goal:** Verify status endpoints provide correct information

**Steps:**
1. Send Bluetooth command "S"
2. Should see status displayed in Bluetooth terminal:
   ```
   Uptime: 3600 seconds
   GATE_IN position: 90°
   GATE_OUT position: 0°
   Total operations: 8
   ```

3. Query server endpoints:
   ```bash
   curl http://localhost:5000/api/system/status
   curl http://localhost:5000/api/servo/status
   curl http://localhost:5000/api/servo/daily-summary
   ```

4. Verify responses contain:
   - Current gate positions
   - Recent activity counts
   - Last action timestamps

**Pass Criteria:** ✅
- [ ] Bluetooth status display is accurate
- [ ] Server status endpoint returns valid JSON
- [ ] Gate positions match actual servo state
- [ ] Daily summary counts match database

---

### Test 2.4: Error Handling
**Goal:** Verify system handles errors gracefully

**Test Cases:**

**Case A: WiFi Disconnection**
1. During active operation, disconnect WiFi on ESP32
2. Send Bluetooth command "1"
3. Verify ESP32 displays: `[ERROR] WiFi not connected`
4. Server does NOT receive event
5. Reconnect WiFi
6. ESP32 attempts to reconnect
7. Send new command and verify recovery

**Pass:** ✅ ESP32 handles disconnection gracefully

**Case B: Invalid Bluetooth Command**
1. Send invalid command "X"
2. Arduino responds: `[?] Unknown command: X`
3. No servo moves

**Pass:** ✅ Invalid commands safely ignored

**Case C: Server Down**
1. Stop Node.js server
2. Send Bluetooth command "1"
3. ESP32 logs HTTP error (curl failed)
4. Servo still moves locally (decoupled)
5. Start server again
6. Send new command - should succeed

**Pass:** ✅ Arduino independent of server

---

## Phase 3: Performance Testing

### Test 3.1: Response Time
**Goal:** Measure end-to-end latency

**Setup:**
- Add timestamps to all components
- Record time from Bluetooth send to database update

**Procedure:**
1. Modify code to log microsecond timestamps:
   ```cpp
   // Arduino
   unsigned long t1 = micros();  // On Bluetooth receive
   unsigned long t2 = micros();  // On servo start
   Serial.println(t2 - t1);      // Should be <10ms
   ```

2. Repeat 10 times with same command
3. Calculate average latency

**Expected Performance:**
- Bluetooth receive → Arduino process: <10ms
- Arduino → Servo move start: <5ms
- Arduino → ESP32 UART: <5ms
- ESP32 → HTTP POST: 100-500ms (network dependent)
- **Total:** 100-600ms from command to database entry

---

### Test 3.2: Load Testing
**Goal:** Verify system stability under sustained load

**Procedure:**
1. Send Bluetooth commands continuously for 1 hour
   ```bash
   # Script to send rapid commands
   for i in {1..3600}; do
     echo "1" > /dev/ttyUSB0
     sleep 1
   done
   ```

2. Monitor:
   - Arduino memory usage (should be stable)
   - ESP32 message queue (no overflow)
   - Server database size (grows predictably)
   - No crashes or freezes

3. Database should have 3600 new entries

**Pass Criteria:** ✅
- [ ] System runs for full duration without reset
- [ ] Database entries are consistent
- [ ] FreeRTOS tasks remain responsive
- [ ] No memory leaks

---

## Checklist for Production Deployment

### Pre-Deployment Verification
- [ ] All three components tested individually
- [ ] Integration tests passed (Test 2.1-2.4)
- [ ] Error handling verified
- [ ] Performance meets expectations
- [ ] Database backups created
- [ ] Rollback plan documented

### Production Checklist
- [ ] Update Arduino code with production pin mappings (verify pins 2,3,14,15,18,19)
- [ ] Update ESP32 WiFi credentials for production network
- [ ] Update server IP address in ESP32 code
- [ ] Verify firewall allows port 5000 access
- [ ] Enable database persistence backups
- [ ] Monitor logs during initial deployment
- [ ] Have manual override (Bluetooth) always available

### Monitoring
- [ ] Server uptime monitoring
- [ ] Database disk space monitoring
- [ ] Servo operation count tracking
- [ ] Error rate monitoring

---

## Rollback Procedure

If issues occur:

1. **Stop everything safely:**
   ```bash
   # Kill server gracefully (SIGINT)
   Ctrl+C
   
   # Reset Arduino (push RST button)
   
   # Reset ESP32 (push RST button)
   ```

2. **Restore backups:**
   ```bash
   cp server/database/parking_system.db.backup server/database/parking_system.db
   cp server/database/db.js.backup server/database/db.js
   cp server/server.js.backup server/server.js
   ```

3. **Revert code:**
   ```bash
   cp arduino_parking_freertos.ino.backup arduino_parking_freertos.ino
   cp esp32_gateway.ino.backup esp32_gateway.ino
   ```

4. **Restart with old version and diagnose**

---

## Support

For issues during testing, consult:
- [SYSTEM_REDESIGN.md](SYSTEM_REDESIGN.md) - Architecture details
- [Troubleshooting section](SYSTEM_REDESIGN.md#-troubleshooting) - Common issues

---

**Testing Version:** 1.0  
**Last Updated:** 2024-01-20  
**Estimated Total Testing Time:** 2-3 hours
