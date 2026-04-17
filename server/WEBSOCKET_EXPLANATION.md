# Giải Thích WebSocket: Hoạt Động Của Server Real-Time

Hệ thống sử dụng **Socket.IO** để biến API truyền thống (Client tự kéo dữ liệu) thành hệ thống **Bất đối xứng/Push-based** (Server tự đẩy dữ liệu).

---

## 1. Kiến Trúc Hoạt Động

Trong project này, WebSocket đóng vai trò là "cầu nối tức thời" giữa **Backend (Node.js)** và **Frontend (React)**.

### Quy Trình Luồng Dữ Liệu:
1. **Dữ liệu đến**: ESP32 gửi HTTP POST lên Server (ví dụ: cập nhật trạng thái slot đỗ xe).
2. **Xử lý tại Server**: `slotRoutes.js` nhận dữ liệu, lưu vào database MySQL.
3. **Phát tin (Broadcast)**: Server sử dụng đối tượng `io` để "hét lên" (emit) trạng thái mới cho tất cả các trình duyệt đang mở Dashboard.
4. **Phản hồi tức thì**: React nhận được sự kiện, cập nhật UI ngay lập tức mà không cần F5.

---

## 2. Cấu Hình Tại Server (`server.js`)

Server khởi tạo cả HTTP và WebSocket trên cùng một cổng (5000):

```javascript
const http = require('http');
const socketIo = require('socket.io');

// Tạo HTTP Server từ Express app
const httpServer = http.createServer(app);

// Khởi tạo Socket.IO với CORS (cho phép Frontend truy cập)
const io = socketIo(httpServer, {
    cors: {
        origin: '*', // Cho phép mọi nguồn (hoặc config cụ thể)
        methods: ['GET', 'POST']
    }
});

// Gắn đối tượng io vào app.locals để các routes khác có thể truy cập
app.locals.io = io;

// Lắng nghe kết nối
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
```

---

## 3. Cách Gửi Dữ Liệu Real-Time (Emit)

Khi có sự thay đổi tại một Controller hoặc Route, Server sẽ phát sự kiện:

### Trong `slotRoutes.js`:
```javascript
// Lấy đối tượng io từ app locals
const io = req.app.locals.io;

// Phát sự kiện 'slotStatusUpdate' kèm dữ liệu mới
io.emit('slotStatusUpdate', {
    slots: updatedSlots,
    timestamp: new Date()
});
```

- **`io.emit`**: Gửi đến **tất cả** các client đang kết nối.
- **`socket.emit`**: Chỉ gửi đến **duy nhất** client đã thực hiện request đó.

---

## 4. Phân Biệt: HTTP vs WebSocket

| Đặc điểm | HTTP (Cũ) | WebSocket (Hiện tại) |
|----------|-----------|--------------------|
| **Kết nối** | Đóng ngay sau mỗi request | Luôn mở (Persistant) |
| **Hướng dữ liệu** | Unidirectional (Client -> Server) | Bi-directional (Cả 2 hướng) |
| **Độ trễ (Latency)** | Cao (do phải hand-shaking lại) | Thực sự thấp (Real-time) |
| **Băng thông** | Tốn kém (gửi kèm Headers mỗi lần) | Tiết kiệm (chỉ gửi data thô) |

---

## 5. Cơ Chế Fallback (Dự phòng)

Hệ thống có cơ chế tự động chuyển đổi:
1. **Ưu tiên 1**: Kết nối qua WebSocket (WSS).
2. **Ưu tiên 2**: Nếu trình duyệt cũ hoặc mạng chặn WebSocket, Socket.IO tự chuyển sang **Long Polling** (giả lập real-time bằng cách giữ kết nối HTTP lâu hơn).

---

## 6. Các Sự Kiện Chính Trong Project

Server hiện đang phát các sự kiện sau:
- `slotStatusUpdate`: Khi có xe vào/ra khỏi chỗ đỗ.
- `gateStatusUpdate`: Khi cửa (Servo) đóng hoặc mở.
- `alarmStatusUpdate`: Khi cảm biến phát hiện cháy/khói.

---

**Kết luận**: WebSocket giúp trải nghiệm người dùng mượt mà hơn, giống như một ứng dụng máy tính thực thụ thay vì một trang web tĩnh.
tĩnh.
