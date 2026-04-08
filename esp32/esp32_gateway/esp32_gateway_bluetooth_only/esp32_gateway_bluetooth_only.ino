/*
 * =====================================================
 * ESP32 SMART PARKING GATEWAY - SIMPLIFIED VERSION
 * =====================================================
 * 
 * Function: WiFi gateway between Arduino (Servo events) and Backend Server
 * 
 * Hardware: ESP32 (ESP32-WROOM or ESP32-S3)
 * 
 * Communication:
 * - UART2 with Arduino Mega: 19200 baud
 *   (RX2=GPIO16, TX2=GPIO17)
 * - WiFi HTTP POST to Backend Server: Port 5000
 * 
 * Data Flow:
 * Arduino Mega --UART(19200)--> ESP32 --WiFi HTTP POST--> Backend Server:5000/api/servo/*
 * 
 * Message Format from Arduino:
 * "$GATE_IN|OPEN|90|1234567890\n"
 * "$GATE_OUT|CLOSE|0|1234567890\n"
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// =====================================================
// PIN DEFINITIONS
// =====================================================

// UART Communication with Arduino
#define ARDUINO_RX_PIN 16    // GPIO16 (RX2 on ESP32)
#define ARDUINO_TX_PIN 17    // GPIO17 (TX2 on ESP32)
#define UART_BAUD_RATE 19200

// ESP32 Built-in LED
#define LED_PIN 2

// =====================================================
// NETWORK CONFIGURATION
// =====================================================

// WiFi Credentials
const char* SSID = "M9IP";           // Change this
const char* PASSWORD = "chien123";   // Change this

// Backend Server Configuration
const char* SERVER_URL = "http://172.20.10.5:5000";  // Change to your server IP
const uint16_t SERVER_PORT = 5000;

// =====================================================
// CONSTANTS
// =====================================================

#define BUFFER_SIZE 128
#define UART_TIMEOUT 1000
#define JSON_BUFFER_SIZE 256
#define MAX_RETRIES 3
#define RETRY_DELAY 1000

// =====================================================
// DATA STRUCTURES
// =====================================================

typedef struct {
    char gate_type[12];      // "GATE_IN" or "GATE_OUT"
    char action[8];          // "OPEN" or "CLOSE"
    uint8_t servo_angle;
    unsigned long timestamp;
} ServoEvent;

typedef struct {
    char type[12];           // "SMOKE" or "FLAME"
    int value;
    unsigned long timestamp;
} AlarmEvent;

typedef struct {
    uint8_t slots[6];
    unsigned long timestamp;
} SlotsUpdate;

typedef struct {
    bool is_connected;
    uint32_t last_sync;
    uint32_t messages_sent;
    uint32_t messages_failed;
} GatewayStatus;

// =====================================================
// GLOBAL VARIABLES
// =====================================================

// Serial communication with Arduino
HardwareSerial ArduinoSerial(2);  // UART2

// Gateway status
GatewayStatus gateway_status = {
    false,
    0,
    0,
    0
};

// Buffer for incoming data
char uart_buffer[BUFFER_SIZE];
uint16_t buffer_index = 0;

// WiFi reconnection tracking
uint32_t last_wifi_check = 0;
unsigned long esp32_start_time = 0;

// =====================================================
// FUNCTION PROTOTYPES
// =====================================================

void setupWiFi();
void setupSerial();
void handleServoEvent(ServoEvent event);
void parseUARTMessage(const char* message);
bool sendToServer(ServoEvent event);
void checkWiFiConnection();
void blinkLED(int count);

// =====================================================
// SETUP
// =====================================================

void setup() {
    // Initialize debugging Serial0
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println("ESP32 PARKING GATEWAY - START UP");
    Serial.println("Servo Event Relay Version");
    Serial.println("========================================\n");
    
    // Initialize LED
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    
    // Setup UART with Arduino
    setupSerial();
    
    // Setup WiFi
    setupWiFi();
    
    esp32_start_time = millis();
    
    // Blink LED to indicate ready
    blinkLED(3);
    
    Serial.println("[GATEWAY] System ready! Waiting for servo events...\n");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
    // Check WiFi connection periodically
    if (millis() - last_wifi_check > 10000) {  // Every 10 seconds
        checkWiFiConnection();
        if (gateway_status.is_connected) {
            Serial.println("[WiFi] ✓ Connected");
        } else {
            Serial.println("[WiFi] ✗ Not connected - API calls will fail");
        }
        last_wifi_check = millis();
    }
    
    // Check for incoming data from Arduino
    if (ArduinoSerial.available()) {
        char c = ArduinoSerial.read();
        Serial.print(c);  // Echo each character for debugging
        
        // Check for message start
        if (c == '$') {
            buffer_index = 0;
            uart_buffer[0] = '\0';
            Serial.println("\n[UART] Message start detected");
        } else if (c == '\n' || c == '\r') {
            if (buffer_index > 0) {
                uart_buffer[buffer_index] = '\0';
                Serial.print("[UART] Complete message: ");
                Serial.println(uart_buffer);
                
                parseUARTMessage(uart_buffer);
                buffer_index = 0;
            }
        } else if (c >= 32 && c <= 126) {  // Printable characters
            if (buffer_index < sizeof(uart_buffer) - 1) {
                uart_buffer[buffer_index++] = c;
            }
        }
    } else {
        // No data available - print status periodically
        static unsigned long last_status = 0;
        if (millis() - last_status > 5000) {
            last_status = millis();
            Serial.print("[STATUS] Awaiting data... WiFi: ");
            Serial.print(gateway_status.is_connected ? "✓" : "✗");
            Serial.print(" | Messages sent: ");
            Serial.print(gateway_status.messages_sent);
            Serial.print(" | Failed: ");
            Serial.println(gateway_status.messages_failed);
        }
    }
    
    delay(100);
}

// =====================================================
// INITIALIZATION FUNCTIONS
// =====================================================

void setupSerial() {
    // UART2 with Arduino
    ArduinoSerial.begin(UART_BAUD_RATE, SERIAL_8N1, ARDUINO_RX_PIN, ARDUINO_TX_PIN);
    delay(500);
    Serial.println("[SETUP] UART2 initialized at 19200 baud");
}

void setupWiFi() {
    Serial.print("[WiFi] Connecting to: ");
    Serial.println(SSID);
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(SSID, PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected!");
        Serial.print("[WiFi] IP Address: ");
        Serial.println(WiFi.localIP());
        gateway_status.is_connected = true;
    } else {
        Serial.println("\n[WiFi] Connection failed!");
        gateway_status.is_connected = false;
    }
}

// =====================================================
// MESSAGE PARSING
// =====================================================

void parseUARTMessage(const char* message) {
    // Phân loại message dựa trên tiền tố: $SERVO, $ALARM, $SLOTS
    
    if (strncmp(message, "SERVO|", 6) == 0) {
        ServoEvent event;
        int parsed = sscanf(message + 6, "%11[^|]|%7[^|]|%hhu|%lu",
                           event.gate_type, event.action, &event.servo_angle, &event.timestamp);
        if (parsed == 4) {
            Serial.println("[PARSE] Servo event parsed successfully");
            handleServoEvent(event);
        } else {
            Serial.println("[PARSE ERROR] Failed to parse servo message");
        }
    } 
    else if (strncmp(message, "ALARM|", 6) == 0) {
        AlarmEvent alert;
        int parsed = sscanf(message + 6, "%11[^|]|%d|%lu",
                           alert.type, &alert.value, &alert.timestamp);
        if (parsed == 3) {
            Serial.println("[PARSE] Alarm event parsed successfully");
            handleAlarmEvent(alert);
        } else {
            Serial.println("[PARSE ERROR] Failed to parse alarm message");
        }
    }
    else if (strncmp(message, "SLOTS|", 6) == 0) {
        SlotsUpdate update;
        int parsed = sscanf(message + 6, "%hhu,%hhu,%hhu,%hhu,%hhu,%hhu|%lu",
                           &update.slots[0], &update.slots[1], &update.slots[2],
                           &update.slots[3], &update.slots[4], &update.slots[5], &update.timestamp);
        if (parsed == 7) {
            Serial.println("[PARSE] Slots update parsed successfully");
            handleSlotsUpdate(update);
        } else {
            Serial.println("[PARSE ERROR] Failed to parse slots message");
        }
    }
    else {
        Serial.print("[PARSE ERROR] Unknown message type: ");
        Serial.println(message);
    }
}

// =====================================================
// EVENT HANDLING
// =====================================================

void handleServoEvent(ServoEvent event) {
    Serial.print("[EVENT] Processing servo event: ");
    Serial.print(event.gate_type);
    Serial.print(" ");
    Serial.println(event.action);
    
    if (sendServoToServer(event)) {
        gateway_status.messages_sent++;
        Serial.println("[EVENT] ✓ Servo event sent successfully");
        blinkLED(1);
    } else {
        gateway_status.messages_failed++;
        Serial.println("[EVENT] ✗ Failed to send servo event");
    }
}

void handleAlarmEvent(AlarmEvent alert) {
    Serial.print("[EVENT] Processing alarm event: ");
    Serial.println(alert.type);
    
    if (sendAlarmToServer(alert)) {
        gateway_status.messages_sent++;
        Serial.println("[EVENT] ✓ Alarm event sent successfully");
        blinkLED(2); // Blink twice for alarm
    } else {
        gateway_status.messages_failed++;
        Serial.println("[EVENT] ✗ Failed to send alarm event");
    }
}

void handleSlotsUpdate(SlotsUpdate update) {
    Serial.print("[EVENT] Processing slots update: [");
    for(int i=0; i<6; i++) {
        Serial.print(update.slots[i]);
        if(i<5) Serial.print(",");
    }
    Serial.println("]");
    
    if (sendSlotsToServer(update)) {
        gateway_status.messages_sent++;
        Serial.println("[EVENT] ✓ Slots update sent successfully");
    } else {
        gateway_status.messages_failed++;
        Serial.println("[EVENT] ✗ Failed to send slots update");
    }
}

// =====================================================
// SERVER COMMUNICATION
// =====================================================

bool sendServoToServer(ServoEvent event) {
    if (!gateway_status.is_connected) {
        Serial.println("[SERVO] ✗ WiFi not connected - cannot send to server");
        return false;
    }
    
    char full_url[128];
    snprintf(full_url, sizeof(full_url), "%s/api/servo/%s", SERVER_URL, 
             (strcmp(event.action, "OPEN") == 0 ? "open" : "close"));
    
    Serial.print("[SERVO] Sending to: ");
    Serial.println(full_url);
    
    HTTPClient http;
    http.begin(full_url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<JSON_BUFFER_SIZE> doc;
    doc["gate_type"] = event.gate_type;
    doc["servo_angle"] = event.servo_angle;
    doc["timestamp"] = event.timestamp;
    
    String json_payload;
    serializeJson(doc, json_payload);
    
    Serial.print("[SERVO] Payload: ");
    Serial.println(json_payload);
    
    int http_code = http.POST(json_payload);
    
    Serial.print("[SERVO] Response code: ");
    Serial.println(http_code);
    
    http.end();
    
    bool success = (http_code == 200 || http_code == 201);
    Serial.print("[SERVO] Result: ");
    Serial.println(success ? "✓ SUCCESS" : "✗ FAILED");
    
    return success;
}

bool sendAlarmToServer(AlarmEvent alert) {
    if (!gateway_status.is_connected) {
        Serial.println("[ALARM] ✗ WiFi not connected - cannot send to server");
        return false;
    }
    
    String url = String(SERVER_URL) + "/api/alarm/log";
    Serial.print("[ALARM] Sending to: ");
    Serial.println(url);
    
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<JSON_BUFFER_SIZE> doc;
    doc["alarm_type"] = alert.type;
    doc["sensor_value"] = alert.value;
    doc["timestamp"] = alert.timestamp;
    
    String json_payload;
    serializeJson(doc, json_payload);
    
    Serial.print("[ALARM] Payload: ");
    Serial.println(json_payload);
    
    int http_code = http.POST(json_payload);
    
    Serial.print("[ALARM] Response code: ");
    Serial.println(http_code);
    
    http.end();
    
    bool success = (http_code == 200 || http_code == 201);
    Serial.print("[ALARM] Result: ");
    Serial.println(success ? "✓ SUCCESS" : "✗ FAILED");
    
    return success;
}

bool sendSlotsToServer(SlotsUpdate update) {
    if (!gateway_status.is_connected) {
        Serial.println("[SLOTS] ✗ WiFi not connected - cannot send to server");
        return false;
    }
    
    String url = String(SERVER_URL) + "/api/slots/update";
    Serial.print("[SLOTS] Sending to: ");
    Serial.println(url);
    
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<512> doc;
    JsonArray slots = doc.createNestedArray("parking_slots");
    for(int i=0; i<6; i++) {
        slots.add(update.slots[i]);
    }
    doc["timestamp"] = update.timestamp;
    
    String json_payload;
    serializeJson(doc, json_payload);
    
    Serial.print("[SLOTS] Payload: ");
    Serial.println(json_payload);
    
    int http_code = http.POST(json_payload);
    
    Serial.print("[SLOTS] Response code: ");
    Serial.println(http_code);
    
    http.end();
    
    bool success = (http_code == 200 || http_code == 201);
    Serial.print("[SLOTS] Result: ");
    Serial.println(success ? "✓ SUCCESS" : "✗ FAILED");
    
    return success;
}

// =====================================================
// WIFI MANAGEMENT
// =====================================================

void checkWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Connection lost! Reconnecting...");
        WiFi.reconnect();
        gateway_status.is_connected = false;
        
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 10) {
            delay(500);
            Serial.print(".");
            attempts++;
        }
        
        if (WiFi.status() == WL_CONNECTED) {
            Serial.println("\n[WiFi] Reconnected!");
            gateway_status.is_connected = true;
        }
    } else {
        gateway_status.is_connected = true;
        gateway_status.last_sync = millis();
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

void blinkLED(int count) {
    for (int i = 0; i < count; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
        delay(100);
    }
}
