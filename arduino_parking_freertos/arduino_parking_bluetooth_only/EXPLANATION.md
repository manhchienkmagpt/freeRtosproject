# Giải Thích Code: Smart Parking System với FreeRTOS

## **I. TỔNG QUAN KIẾN TRÚC**

Code này là **hệ thống đỗ xe thông minh** chạy trên **Arduino Mega** với **FreeRTOS** (Real-Time Operating System). Thay vì chạy code tuần tự (một hàng lệnh sau hàng khác), nó chạy **nhiều task đồng thời**.

```
┌─────────────────────────────────────────────┐
│         SMART PARKING SYSTEM (FreeRTOS)     │
├─────────────────────────────────────────────┤
│ 9 Tasks chạy SONG SONG:                    │
│ ✓ TaskBluetooth (nhận lệnh)                │
│ ✓ TaskGateControl (điều khiển cửa)        │
│ ✓ TaskDisplayLCD (hiển thị màn hình)      │
│ ✓ TaskParkingSensor (đọc cảm biến)        │
│ ✓ TaskCommunicationESP32 (gửi lên server) │
│ ✓ TaskAlarm (phát hiện cảnh báo)          │
│ ✓ TaskSlotSync (đồng bộ dữ liệu)          │
│ ✓ TaskBuzzer (điều khiển loa báo)         │
│ ✓ TaskHeartbeat (giám sát hệ thống)       │
└─────────────────────────────────────────────┘
```

---

## **II. CÁC THÀNH PHẦN CHÍNH**

### **1. Thiết Bị Kết Nối**

| Thiết Bị | Chế Độ Kết Nối | Tác Dụng |
|----------|--|---|
| **Servo Motor (2 cái)** | PWM pins 2,3 | Điều khiển cửa vào/ra |
| **IR Sensors (6 cái)** | Pins A0-A5 | Phát hiện chỗ đỗ có xe |
| **Bluetooth HC-05** | Serial3 (9600 baud) | Nhận lệnh từ điện thoại |
| **ESP32 Gateway** | Serial1 (19200 baud) | Gửi dữ liệu lên server |
| **LCD I2C** | I2C (0x27) | Hiển thị trạng thái |
| **Smoke/Flame Sensors** | A8, Pin22 | Phát hiện cháy |
| **Buzzer** | Pin24 | Báo động |

---

## **III. CẤU TRÚC CODE CHI TIẾT**

### **A. Phần Setup (dòng 198-290)**

- **Khởi tạo hardware**: Servo, Bluetooth, ESP32, LCD.
- **Cơ chế đồng bộ**:
    - `servoMutex`: Đảm bảo chỉ 1 task quyền điều khiển Servo tại một thời điểm.
    - `servoEventQueue`: Hàng đợi chứa các yêu cầu điều khiển cửa.
- **Khởi tạo Task**: Tạo 9 tasks với các mức ưu tiên (priority) khác nhau.

### **B. Các Tasks Chính**

#### **1. TaskBluetooth (Priority 4 - Cao nhất)**
Phụ trách việc đọc dữ liệu từ Serial3 (Bluetooth). Khi nhận được một ký tự lệnh, nó sẽ gọi hàm xử lý để đưa yêu cầu vào hàng đợi.

#### **2. TaskGateControl (Priority 3)**
Đợi yêu cầu từ `servoEventQueue`. Khi có lệnh, nó sẽ chiếm quyền (take mutex), điều khiển Servo của cửa tương ứng (vào hoặc ra), đợi 500ms để servo quay xong, sau đó nhả quyền (give mutex).

#### **3. TaskParkingSensor (Priority 1)**
Đọc 6 cảm biến hồng ngoại IR mỗi 500ms để cập nhật trạng thái các chỗ đỗ xe vào mảng `parking_slots`.

#### **4. TaskDisplayLCD (Priority 3)**
Hiển thị thông tin lên màn hình LCD. Để hiển thị được nhiều thông tin trên màn hình nhỏ, nó chia làm 3 trang (Page 0, 1, 2) và tự động chuyển trang mỗi 3 giây:
- **Trang 0**: Vị trí cửa (độ).
- **Trang 1**: Trạng thái Slot 1-3.
- **Trang 2**: Trạng thái Slot 4-6.

#### **5. TaskAlarm (Priority 2)**
Đọc cảm biến khói (Analog) và cảm biến lửa (Digital). Nếu giá trị vượt ngưỡng, nó kích hoạt trạng thái báo động (`alarm_active`), gửi dữ liệu cảnh báo lên ESP32 và thông báo qua Bluetooth.

#### **6. TaskBuzzer (Priority 2)**
Điều khiển loa báo động. Nếu có báo động, nó sẽ phát tiếng kêu ngắt quãng (beep-beep). Nếu người dùng bật loa thủ công qua Bluetooth, nó sẽ giữ loa kêu liên tục.

#### **7. TaskCommunicationESP32 (Priority 2)**
Lấy các sự kiện Servo từ hàng đợi và gửi chuỗi dữ liệu tương ứng lên ESP32 qua Serial1 để cập nhật lên ứng dụng web/server.

#### **8. TaskSlotSync (Priority 1)**
Theo dõi sự thay đổi của các chỗ đỗ xe. Nếu có xe ra/vào hoặc định kỳ mỗi 2 giây, nó sẽ gửi toàn bộ trạng thái 6 slot lên ESP32.

#### **9. TaskHeartbeat (Priority 1)**
Cung cấp thông tin chẩn đoán hệ thống qua Serial Monitor mỗi 3 giây và nháy nhẹ loa để báo hiệu vi điều khiển vẫn đang hoạt động bình thường.

---

## **IV. CƠ CHẾ GIAO TIẾP DỮ LIỆU**

Hệ thống sử dụng các format chuỗi chuẩn cho ESP32:
- **Cửa**: `$GATE_IN|OPEN|90|timestamp`
- **Chỗ đỗ**: `$SLOTS|1,0,1,1,0,0|timestamp`
- **Báo động**: `$ALARM|SMOKE|450|timestamp`

---

## **V. LỢI ÍCH CỦA FreeRTOS TRONG DỰ ÁN NÀY**

1. **Không bị chặn (Non-blocking)**: Trong khi Servo đang quay (đợi 500ms), các task khác như đọc cảm biến cháy hay nhận lệnh Bluetooth vẫn hoạt động bình thường.
2. **Ưu tiên xử lý**: Lệnh từ người dùng (Bluetooth) luôn được ưu tiên xử lý trước các việc định kỳ (như Heartbeat).
3. **Quản lý tài nguyên**: Mutex ngăn chặn việc hai task cùng điều khiển một chân PWM cùng lúc, tránh xung đột phần cứng.
