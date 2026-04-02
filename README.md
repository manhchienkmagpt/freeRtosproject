# HỆ THỐNG BÃI ĐỖ XE THÔNG MINH
## Smart Parking System - Complete Implementation

---

## 📋 MỤC LỤC
1. [Giới thiệu hệ thống](#giới-thiệu-hệ-thống)
2. [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
3. [Danh sách thiết bị](#danh-sách-thiết-bị)
4. [Sơ đồ kết nối phần cứng](#sơ-đồ-kết-nối-phần-cứng)
5. [Cài đặt & Cấu hình](#cài-đặt--cấu-hình)
6. [Hướng dẫn nạp code](#hướng-dẫn-nạp-code)
7. [Chạy server](#chạy-server)
8. [API Documentation](#api-documentation)
9. [Kết nối phần cứng](#kết-nối-phần-cứng)
10. [Hướng dẫn test](#hướng-dẫn-test)

---

## 🎯 GIỚI THIỆU HỆ THỐNG

Hệ thống bãi đỗ xe thông minh là một giải pháp IoT hoàn chỉnh cho quản lý bãi đỗ xe hiện đại. Hệ thống gồm 3 phần chính:

### **Các tính năng chính:**
- ✅ Quản lý vị trí đỗ xe (6 vị trí)
- ✅ Kiểm soát vào/ra bằng RFID
- ✅ Tính toán tiền tự động
- ✅ Cảnh báo cháy/khói bằng sensor
- ✅ Quản lý cổng qua servo motor
- ✅ Điều khiển từ Bluetooth
- ✅ Ghi nhận giọng nói (qua Bluetooth app)
- ✅ Lưu trữ dữ liệu trên server
- ✅ Dashboard & Report thống kê

---

## 🏗️ KIẾN TRÚC HỆ THỐNG

```
┌─────────────────────────────────────────────────────────┐
│                    BACKEND SERVER                       │
│         Node.js + Express + SQLite3                     │
│  - Quản lý xe vào/ra & tính tiền                        │
│  - Lưu transaction & log cảnh báo                       │
│  - Thống kê & báo cáo                                   │
└──────────────────┬──────────────────────────────────────┘
                   │ WiFi HTTP
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   ESP32 GATEWAY                         │
│  - Nhận dữ liệu từ Arduino qua UART                     │
│  - Parse JSON & format message                          │
│  - Gửi HTTP request lên server                          │
└──────────────────┬──────────────────────────────────────┘
                   │ UART (19200 baud)
                   ▼
┌─────────────────────────────────────────────────────────┐
│          ARDUINO MEGA + FreeRTOS                        │
│     Main Controller chạy 8 tasks song song:             │
│  • TaskRFID: Đọc 2 RFID reader (RC522)                 │
│    ├─ RFID IN (pin 53) → Servo IN mở tự động          │
│    └─ RFID OUT (pin 52) → Servo OUT mở tự động        │
│  • TaskParkingSensor: Kiểm tra vị trí (IR)             │
│  • TaskLCD: Hiển thị LCD I2C 16x2                      │
│  • TaskGateControl: Điều khiển 2 servo                 │
│  • TaskAlarm: Phát hiện khói & lửa                     │
│  • TaskBluetooth: HC-05 Bluetooth command              │
│  • TaskButtonHandler: Nút bấm vật lý                    │
│  • TaskCommunicationESP32: Gửi dữ liệu                 │
└─────────────────────────────────────────────────────────┘
```

### **Data Flow (Updated):**
```
┌─────────────────────────────────────────────────────┐
│           ENTRANCE GATE (Cổng vào)                  │
├─────────────────────────────────────────────────────┤
RFID Card Scanned (IN reader)
    ↓
Arduino TaskRFID (pin 53)
    ↓
xQueueGateCommand → Type: 1 (IN)
    ↓
TaskGateControl
    ↓
Servo Gate IN Opens ✓ (IMMEDIATE - No server wait!)
    ↓
Data sent to ESP32 → Server (for logging)
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│           EXIT GATE (Cổng ra)                       │
├─────────────────────────────────────────────────────┤
RFID Card Scanned (OUT reader)
    ↓
Arduino TaskRFID (pin 52)
    ↓
xQueueGateCommand → Type: 2 (OUT)
    ↓
TaskGateControl
    ↓
Servo Gate OUT Opens ✓ (IMMEDIATE - No server wait!)
    ↓
Data sent to ESP32 → Server (for logging)
└─────────────────────────────────────────────────────┘
```

---

## 📦 DANH SÁCH THIẾT BỊ

### **Bộ điều khiển chính:**
| Thiết bị | Model | Số lượng | Mục đích |
|---------|-------|---------|---------|
| Arduino Mega | ATmega2560 | 1 | Board chính xử lý logic |
| ESP32 | ESP32-WROOM hoặc S3 | 1 | WiFi gateway |

### **Sensor & Actuator:**
| Thiết bị | Model | Số lượng | GPIO/Interface | Mục đích |
|---------|-------|---------|===============|---------|
| RFID Reader IN | RC522 | 1 | SPI (CS:53) | Đọc thẻ RFID (Cổng vào) |
| RFID Reader OUT | RC522 | 1 | SPI (CS:52) | Đọc thẻ RFID (Cổng ra) |
| IR Sensor | generic | 6 | Analog A0-A5 | Phát hiện xe ở 6 vị trí |
| LCD | LCD I2C 16x2 | 1 | I2C (SDA:20, SCL:21) | Hiển thị trạng thái |
| Servo | SG90 | 2 | PWM (Pin 2, 3) | Điều khiển cổng IN/OUT |
| Bluetooth | HC-05 | 1 | UART3 (RX:15, TX:14) | Kết nối điện thoại |
| Smoke Sensor | MQ-2 | 1 | Analog A8 | Phát hiện khói |
| Flame Sensor | generic | 1 | Digital 22 | Phát hiện lửa |
| Buzzer | 3V | 1 | PWM 24 | Cảnh báo âm thanh |
| Button | tactile | 3 | Digital 25, 26, 27 | Mở cổng, báo động |

### **Linh kiện hỗ trợ:**
- Power supply: 12V (cho Arduino & sensors), 5V (cho servo)
- Dây cáp UART cross-over (RX-TX giữa Arduino và ESP32)
- Dây cáp I2C (SDA, SCL cho LCD)
- Dây cấp nguồn, cắm đầu
- Breadboard hoặc PCB (tuỳ chọn)

---

## 🔌 SƠ ĐỒ KẾT NỐI PHẦN CỨNG

### **ARDUINO MEGA PINOUT:**

```
┌─────────────────────────────────────────────────────────┐
│                   ARDUINO MEGA 2560                     │
├─────────────────────────────────────────────────────────┤
│ PIN NAME        │ SPI/UART/Other    │ Kết nối           │
├─────────────────┼───────────────────┼───────────────────┤
│ 2               │ PWM               │ Servo Gate IN     │
│ 3               │ PWM               │ Servo Gate OUT    │
│ 8               │ Digital           │ RFID RST (both)   │
│ 14, 15          │ UART3 (TX, RX)    │ Bluetooth TX, RX  │
│ 18, 19          │ UART1 (TX, RX)    │ ESP32 TX, RX      │
│ 20, 21          │ SDA, SCL          │ LCD I2C           │
│ 22              │ Digital           │ Flame Sensor      │
│ 24              │ PWM               │ Buzzer            │
│ 25, 26, 27      │ Digital Input     │ Button IN/OUT/ALM │
│ 50, 51, 52      │ MISO, MOSI, CLK   │ SPI (shared RFID) │
│ 52              │ CS                │ RFID OUT reader   │
│ 53              │ CS                │ RFID IN reader    │
├─────────────────┼───────────────────┼───────────────────┤
│ A0-A5           │ Analog Input      │ IR Sensors (6)    │
│ A8              │ Analog Input      │ Smoke Sensor      │
└─────────────────────────────────────────────────────────┘
```

### **Sơ đồ đấu nối chi tiết:**

#### **1. Dual RFID Readers RC522:**

**RFID IN (Cổng vào) - Entrance Gate:**
```
RC522 IN Pin ──→ Arduino Pin
VCC        ──→ 5V
GND        ──→ GND
MISO       ──→ 50 (shared)
MOSI       ──→ 51 (shared)
CLK        ──→ 52 (shared)
CS         ──→ 53 (unique)
RST        ──→ 8 (shared)
```

**RFID OUT (Cổng ra) - Exit Gate:**
```
RC522 OUT Pin ──→ Arduino Pin
VCC         ──→ 5V
GND         ──→ GND
MISO        ──→ 50 (shared)
MOSI        ──→ 51 (shared)
CLK         ──→ 52 (shared)
CS          ──→ 52 (unique)
RST         ──→ 8 (shared)
```

**SPI Bus Architecture:**
- Cả 2 readers chia sẻ SPI bus (MISO, MOSI, CLK)
- Mỗi reader có Chip Select (CS) pin riêng
- Shared Reset (RST) pin
- Hoạt động độc lập: quét thẻ → servo tương ứng mở ngay lập tức

#### **2. LCD I2C 16x2:**
```
LCD Pin ──→ Arduino Pin
VCC   ──→ 5V
GND   ──→ GND
SDA   ──→ 20 (SDA)
SCL   ──→ 21 (SCL)
Address: 0x27 (tuỳ LCD)
```

#### **3. Servo Motors (SG90):**
```
Servo IN:
- Signal ──→ Pin 2 (PWM)
- VCC   ──→ 5V
- GND   ──→ GND

Servo OUT:
- Signal ──→ Pin 3 (PWM)
- VCC   ──→ 5V
- GND   ──→ GND
```

#### **4. IR Sensors (6 vị trí):**
```
Slot 1: A0
Slot 2: A1
Slot 3: A2
Slot 4: A3
Slot 5: A4
Slot 6: A5

Mỗi sensor:
- Output ──→ Analog pin
- VCC   ──→ 5V
- GND   ──→ GND
```

#### **5. Bluetooth HC-05:**
```
HC-05 Pin ──→ Arduino Pin
VCC   ──→ 5V
GND   ──→ GND
TX    ──→ RX3 (Pin 15)
RX    ──→ TX3 (Pin 14)
```

#### **6. Smoke Sensor (MQ-2):**
```
MQ-2 Pin ──→ Arduino Pin
VCC   ──→ 5V
GND   ──→ GND
AOut  ──→ A8
```

#### **7. Flame Sensor:**
```
Flame Pin ──→ Arduino Pin
VCC   ──→ 5V
GND   ──→ GND
Out   ──→ Pin 22
```

#### **8. Buzzer & Buttons:**
```
Buzzer:   Pin 24 (PWM), GND
Button 1: Pin 25 (IN gate), Pull-up
Button 2: Pin 26 (OUT gate), Pull-up
Button 3: Pin 27 (Alarm), Pull-up
```

#### **9. ESP32 UART Connection:**
```
Arduino ──────→ ESP32
TX1 (Pin 18) ──→ RX2 (GPIO16)
RX1 (Pin 19) ──→ TX2 (GPIO17)
GND ──────→ GND
Baud Rate: 19200
```

---

## 💻 CÀI ĐẶT & CẤU HÌNH

### **1. Arduino IDE Setup:**

**Cài đặt Arduino IDE:**
- Download từ: https://www.arduino.cc/en/software
- Cài đặt board driver cho Arduino Mega 2560

**Cài đặt Libraries:**
Đi tới: Sketch → Include Library → Manage Libraries

Tìm và cài đặt các thư viện sau:
```
1. "MFRC522" by GithubCommunity (RFID)
2. "LiquidCrystal I2C" by Frank de Brabander (LCD)
3. "Servo" (built-in)
4. "WiFi" (built-in cho ESP32)
5. "ArduinoJson" by Benoit Blanchon (ESP32)
```

### **2. FreeRTOS Configuration (nếu chưa có):**

Nếu Arduino IDE chưa hỗ trợ FreeRTOS, cài đặt từ:
- **Arduino.cc**: FreeRTOS library
- Hoặc sử dụng: Arduino Core for Arduino Mega with FreeRTOS

### **3. Node.js & Backend Setup:**

**Cài đặt Node.js:**
- Download từ: https://nodejs.org
- Chọn LTS version (v18.x hoặc mới hơn)

**Cài đặt dependencies:**
```bash
cd server
npm install
```

**Cấu hình WiFi & Server:**
Mở `esp32/esp32_gateway.ino` và thay đổi:
```cpp
const char* SSID = "YOUR_SSID";           // WiFi network name
const char* PASSWORD = "YOUR_PASSWORD";   // WiFi password
const char* SERVER_URL = "http://192.168.1.100:5000";  // Server URL
```

---

## 🚀 HƯỚNG DẪN NẠP CODE

### **Arduino Code:**

1. **Mở Arduino IDE**
2. **File → Open** → `arduino_parking_freertos.ino`
3. **Tools → Board → Arduino Mega 2560**
4. **Tools → COM Port → Select Port** (COM3, COM4, etc)
5. **Sketch → Upload** (Ctrl + U)
6. Chờ đến khi hiện "Upload complete"

### **ESP32 Code:**

1. **Cài đặt ESP32 Board:**
   - File → Preferences
   - Additional Boards Manager URLs:
   ```
   https://dl.espressif.com/dl/package_esp32_index.json
   ```
   - Tools → Board Manager → Tìm "esp32" → Install

2. **Mở ESP32 code:**
   - File → Open → `esp32/esp32_gateway.ino`
   - Tools → Board → **ESP32 Dev Module** (hoặc S3)
   - Tools → COM Port → Select ESP32 port
   - **Sketch → Upload**

### **Verify Upload:**
Mở Serial Monitor (Ctrl + Shift + M) ở baud 115200
Sẽ thấy log startup message

---

## 🖥️ CHẠY BACKEND SERVER

### **Installation:**
```bash
# Vào thư mục server
cd d:\project\real_time_freeRtos\server

# Cài dependencies
npm install

# Chạy server
npm start

# Hoặc chạy với nodemon (auto-restart khi có thay đổi)
npm run dev
```

### **Dùng SQLite với Node:**

Database sẽ tự động tạo khi server start lần đầu:
- Database file: `server/database/parking_system.db`
- Tables sẽ tự động khởi tạo từ `db.js`

### **Verify Server Status:**
```
Mở browser: http://localhost:5000/health

Kết quả:
{
  "status": "OK",
  "timestamp": "2024-03-24T10:30:00.000Z",
  "uptime": 45.234
}
```

---

## 📡 API DOCUMENTATION

### **Base URL:** `http://localhost:5000`

### **1. VEHICLE MANAGEMENT**

#### **Entry Request:**
```http
POST /api/vehicle/enter
Content-Type: application/json

Body:
{
  "rfid_uid": "04A1B2C3",
  "timestamp": 1234567890,
  "parking_slots": [0, 0, 1, 0, 0, 1]
}

Response:
{
  "vehicle_id": "uuid-string",
  "rfid_uid": "04A1B2C3",
  "user_id": "U001",
  "user_name": "Nguyễn Văn A",
  "entry_time": "2024-03-24T10:00:00Z",
  "status": "Entry recorded"
}
```

#### **Exit Request (Calculate Fee):**
```http
POST /api/vehicle/exit
Content-Type: application/json

Body:
{
  "rfid_uid": "04A1B2C3",
  "timestamp": 1234571490,
  "parking_slots": [0, 0, 0, 0, 0, 1]
}

Response:
{
  "vehicle_id": "uuid",
  "entry_time": "2024-03-24T10:00:00Z",
  "exit_time": "2024-03-24T11:00:00Z",
  "duration_hours": 1,
  "payment_amount": 50000,
  "payment_status": "completed"
}
```

#### **Get Vehicle History:**
```http
GET /api/vehicles?page=1&limit=20
GET /api/vehicle/history/U001?days=30
```

### **2. PARKING STATUS**

#### **Real-time Status:**
```http
GET /api/parking-status

Response:
{
  "total_slots": 6,
  "occupied_slots": 2,
  "available_slots": 4,
  "occupancy_percentage": 33,
  "slots": [
    {"slot_id": 1, "is_occupied": 0},
    {"slot_id": 2, "is_occupied": 1},
    ...
  ]
}
```

### **3. ALARM MANAGEMENT**

#### **Log Alarm:**
```http
POST /api/alarm
Content-Type: application/json

Body:
{
  "alarm_type": "smoke",
  "sensor_value": 450,
  "timestamp": 1234567890
}
```

#### **Get Active Alarms:**
```http
GET /api/alarm/active
```

#### **Get Recent Alarms:**
```http
GET /api/alarm/recent?hours=24
```

#### **Resolve Alarm:**
```http
PUT /api/alarm/{alarm_id}/resolve
Body:
{
  "action_taken": "Manual inspection completed",
  "resolved_by": "Admin"
}
```

### **4. STATISTICS**

#### **Daily Statistics:**
```http
GET /api/statistics/daily

Response:
{
  "date": "2024-03-24",
  "vehicles_count": 45,
  "revenue": 2250000,
  "avg_duration_minutes": 65
}
```

#### **Hourly Statistics:**
```http
GET /api/statistics/hourly
```

#### **System Status:**
```http
GET /api/system/status

Response:
{
  "status": "OK",
  "total_vehicles_processed": 1250,
  "occupied_slots": 3,
  "total_available_slots": 6,
  "total_revenue": 62500000,
  "uptime_seconds": 85430
}
```

---

## 🔧 KẾT NỐI PHẦN CỨNG

### **Các bước kết nối chi tiết:**

1. **Chuẩn bị dây cáp và breadboard**
   - Cắm Arduino Mega vào breadboard (hoặc để bên cạnh)
   - Sắp xếp các sensor và actuator

2. **Kết nối Power:**
   - GND: Kết nối tất cả GND (Arduino, sensors, actuators)
   - VCC: Cung cấp 5V cho các thành phần
   - Power relay cho servo nếu cần (>500mA)

3. **Kết nối RFID RC522:**
   - SPI pins (50, 51, 52, 53)
   - RST pin 8

4. **Kết nối LCD through I2C:**
   - SDA ← Pin 20
   - SCL ← Pin 21

5. **Kết nối IR Sensors:**
   - Mỗi sensor → Analog pin (A0-A5)

6. **Kết nối Servo Motors:**
   - Signal 1 → Pin 2
   - Signal 2 → Pin 3

7. **Kết nối Bluetooth:**
   - TX ← Pin 14
   - RX ← Pin 15

8. **Kết nối Sensors:**
   - Smoke: A8
   - Flame: Pin 22
   - Buzzer: Pin 24

9. **Kết nối Buttons:**
   - Pin 25, 26, 27

10. **Kết nối ESP32:**
    - Cắm ESP32 vào micro USB
    - UART1: Pin 18 (TX) ← Pin 17 (RX) trên ESP32
    - UART1: Pin 19 (RX) ← Pin 16 (TX) trên ESP32

### **Kiểm tra kết nối:**
```
1. Cắm USB vào Arduino → LED sẽ nhấp nháy
2. Mở Serial Monitor (115200 baud)
3. Sẽ thấy log startup message
4. Kiểm tra từng sensor bằng cách:
   - Lắc RFID card gần reader
   - Que IR sensor
   - Kiểm tra LCD hiển thị
```

---

## 🧪 HƯỚNG DẪN TEST

### **Test Level 1: Phần cứng cơ bản**

#### **Test Individual Sensors:**
```
1. RFID Test:
   - Lắc thẻ RFID gần reader
   - Xem Serial Monitor → Phải hiện UID
   
2. IR Sensors Test:
   - Đặt tay lên sensor IR → Analog value thay đổi
   
3. LCD Test:
   - Khi Arduino start → LCD phải hiển thị trạng thái
   
4. Servo Test:
   - Servo phải move từ 0° → 90° → 0°
   
5. Buzzer Test:
   - Nghe tiếng bíp khi alarm trigger
```

### **Test Level 2: FreeRTOS Tasks**

Kiểm tra từng task bằng Serial output:
```
[TASK] RFID Card Reader started
[TASK] Parking Sensor Monitor started
[TASK] LCD Display started
[TASK] Gate Control started
[TASK] Alarm Monitor started
[TASK] Bluetooth Handler started
[TASK] Button Handler started
[TASK] ESP32 Communication started
```

### **Test Level 3: ESP32 Gateway**

```
1. Kiểm tra WiFi connect:
   Serial Monitor ESP32 → "[WiFi] Connected!"
   
2. Kiểm tra UART từ Arduino:
   - Lắc RFID card
   - Xem ESP32 Serial → "[UART] Received: ..."
   
3. Kiểm tra HTTP request:
   - Xem Serial log → "[HTTP] POST to: /api/vehicle/enter"
```

### **Test Level 4: Backend Server**

#### **Test với cURL:**
```bash
# Health check
curl http://localhost:5000/health

# Get parking status
curl http://localhost:5000/api/parking-status

# Simulate vehicle entry
curl -X POST http://localhost:5000/api/vehicle/enter \
  -H "Content-Type: application/json" \
  -d '{"rfid_uid": "04A1B2C3", "parking_slots": [0,0,1,0,0,1]}'

# Get system status
curl http://localhost:5000/api/system/status
```

#### **Test với Postman:**
1. Download Postman
2. Tạo Collection "Smart Parking"
3. Thêm requests như trên
4. Test từng endpoint

### **Test Level 5: End-to-End**

```
Sequence:
1. Xe vào → Lắc RFID card vào
   ✓ Arduino nhận RFID
   ✓ Servo mở cổng
   ✓ LCD hiển thị "Vehicle Enter"
   ✓ ESP32 gửi HTTP request
   ✓ Server lưu database

2. Xe ra → Lắc RFID card ra
   ✓ Server tính tiền
   ✓ Trừ từ account balance
   ✓ Servo mở cổng OUT
   ✓ LCD hiển thị "Payment: 50000 VND"

3. Kiểm tra IR sensors:
   ✓ Khi có xe → Status = OCCUPIED
   ✓ Khi không có → Status = EMPTY
   ✓ LCD hiển thị "Slots: 3/6"

4. Test Bluetooth:
   ✓ Kết nối với HC-05 app
   ✓ Gửi lệnh OPEN_IN → Servo mở
   ✓ Gửi lệnh ALARM_ON → Buzzer kêu

5. Test Alarm:
   ✓ Khi khí -> Smoke sensor trigger → Buzzer kêu
   ✓ Server lưu alarm log
   ✓ Có thể resolve alarm từ API
```

### **Test Data Examples:**

#### **Sample RFID Card UIDs:**
```
04A1B2C3 - User 1
04B3C4D5 - User 2
04C4D5E6 - User 3
```

#### **Sample Parking Status:**
```
[0, 0, 1, 0, 1, 0] = Slot 3 & 5 occupied
[1, 1, 1, 1, 1, 1] = Parking FULL
```

#### **Sample Alarm Data:**
```
{
  "alarm_type": "smoke",
  "sensor_value": 450
}
```

---

## 📊 KIẾN TRÚC DATABASE

### **ERD (Entity Relationship Diagram):**

```
┌──────────────┐
│ users        │
├──────────────┤
│ user_id (PK) │
│ rfid_uid     │
│ full_name    │
│ balance      │
└──────┬───────┘
       │ 1:N
       ├──────────┐
       │          │
       │          ▼
   ┌───────────────────┐
   │ vehicles_log      │
   ├───────────────────┤
   │ vehicle_id (PK)   │
   │ entry_time        │
   │ exit_time         │
   │ payment_amount    │
   │ payment_status    │
   └───────────────────┘

┌──────────────────┐
│ parking_slots    │
├──────────────────┤
│ slot_id (PK)     │
│ is_occupied      │
│ current_vehicle  │
└──────────────────┘

┌──────────────────┐
│ alarm_logs       │
├──────────────────┤
│ alarm_id (PK)    │
│ alarm_type       │
│ sensor_value     │
│ alarm_time       │
│ severity         │
│ resolved         │
└──────────────────┘
```

---

## 💡 VÍ DỤ DỮ LIỆU

### **Vehicle Entry Log Example:**
```javascript
{
  vehicle_id: "123e4567-e89b-12d3-a456-426614174000",
  rfid_uid: "04A1B2C3",
  user_id: "U001",
  entry_time: "2024-03-24 10:00:00",
  exit_time: null,
  entry_gate: "main",
  payment_amount: null,
  payment_status: "pending"
}
```

### **Transaction Example:**
```javascript
{
  transaction_id: "txn-uuid",
  user_id: "U001",
  amount: 50000,
  transaction_status: "completed",
  payment_method: "account_balance",
  transaction_time: "2024-03-24 11:00:00"
}
```

### **Alarm Log Example:**
```javascript
{
  alarm_id: "alarm-uuid",
  alarm_type: "smoke",
  sensor_value: 450,
  alarm_time: "2024-03-24 10:30:00",
  severity: "high",
  resolved: false
}
```

---

## 🔒 SECURITY CONSIDERATIONS

1. **RFID Security:**
   - Thẻ RFID có thể bị clone → Thêm authentication ở server
   - Sử dụng encrypted RFID cards (MF1S70)

2. **Network Security:**
   - Sử dụng HTTPS (không phải HTTP)
   - Thêm API key authentication
   - Validate input data ở server

3. **Database:**
   - Sử dụng parameterized queries (tránh SQL injection)
   - Encrypt sensitive data (password, balance)
   - Regular backups

4. **Physical Security:**
   - Đặt Arduino & sensors ở vị trí an toàn
   - Bảo vệ cáp điện

---

## 🛠️ TROUBLESHOOTING

### **Arduino không nhận dữ liệu:**
```
✓ Kiểm tra USB cable
✓ Kiểm tra board selection (Tools → Board)
✓ Kiểm tra COM port
✓ Baud rate phải theo code (115200)
```

### **ESP32 không kết nối WiFi:**
```
✓ Kiểm tra SSID & Password
✓ Kiểm tra WiFi signal strength
✓ Reboot ESP32 (nút EN)
✓ Kiểm tra WiFi channel (2.4GHz)
```

### **Server không nhận HTTP request:**
```
✓ Kiểm tra server chạy (npm start)
✓ Kiểm tra firewall allow port 5000
✓ Kiểm tra IP address của ESP32
✓ Ping từ ESP32 tới server
```

### **Database lỗi:**
```
✓ Xóa parking_system.db
✓ Khởi động lại server (sẽ auto-create)
✓ Kiểm tra file permissions
```

### **LCD không hiển thị:**
```
✓ Kiểm tra I2C address (0x27 hoặc 0x3F)
✓ Kiểm tra dây SDA/SCL
✓ Kiểm tra Pullup resistors
✓ Thay đổi contrast pot
```

---

## 📈 MỞ RỘNG HỆ THỐNG

### **Có thể thêm các tính năng:**

1. **Mobile App:**
   - Flutter hoặc React Native
   - Check parking availability
   - View history & statistics
   - Notify when payment fail

2. **Machine Learning:**
   - Predict peak hours
   - Optimize pricing
   - Anomaly detection

3. **Payment Gateway:**
   - Stripe / PayPal integration
   - Mobile wallet (Momo, ZaloPay)
   - QR code payment

4. **Multiple Parking Lots:**
   - Multi-location support
   - Central dashboard
   - Load balancing

5. **Advanced Reporting:**
   - Excel export
   - PDF reports
   - Real-time analytics

---

## 📝 MONITORING & LOGS

### **Arduino Serial Log:**
```
[INIT] Hardware initialization completed
[RFID] Card detected: 04A1B2C3 | Gate: IN
[PARKING] Slot 1 - OCCUPIED
[GATE] Auto-closed Gate 1
[ALARM] SMOKE DETECTED: 450
[ESP32] Sent: 1 | 04A1B2C3
```

### **Server Console Log:**
```
[2024-03-24 10:00:00] POST /api/vehicle/enter
[VEHICLE] Entry recorded - ID: 123e4567-e89b...
[VEHICLE] Exit processed - ID: 123e4567...
[PAYMENT] Completed - Balance deducted 50000 VND
[ALARM] Alert received - Type: smoke, Value: 450
```

---

## 📞 SUPPORT & CONTACT

- **Documentation:** Xem README này
- **Code Repository:** Upload lên GitHub
- **Issue Tracking:** Sử dụng GitHub Issues
- **Community Forum:** Arduino forum

---

## 📄 LICENSE

MIT License - Free to use and modify

---

## 🎓 EDUCATIONAL PURPOSE

Hệ thống này được thiết kế như một **graduation project** để:
- Demonstrating embedded systems knowledge
- IoT architecture implementation
- Real-time systems with FreeRTOS
- Full-stack development (firmware + backend)
- Database design & management
- API development & integration

---

**Version:** 1.0.0  
**Last Updated:** 2024-03-24  
**Author:** Smart Parking Team

