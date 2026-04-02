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
        last_wifi_check = millis();
    }
    
    // Check for incoming data from Arduino
    while (ArduinoSerial.available()) {
        char c = ArduinoSerial.read();
        
        // Check for message start
        if (c == '$') {
            buffer_index = 0;
            uart_buffer[0] = '\0';
        } else if (c == '\n' || c == '\r') {
            if (buffer_index > 0) {
                uart_buffer[buffer_index] = '\0';
                Serial.print("[UART] Received: ");
                Serial.println(uart_buffer);
                
                parseUARTMessage(uart_buffer);
                buffer_index = 0;
            }
        } else if (c >= 32 && c <= 126) {  // Printable characters
            if (buffer_index < sizeof(uart_buffer) - 1) {
                uart_buffer[buffer_index++] = c;
            }
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
    // Format: "GATE_IN|OPEN|90|1234567890"
    
    ServoEvent event;
    
    // Parse with sscanf
    int parsed = sscanf(message, "%11[^|]|%7[^|]|%hhu|%lu",
                       event.gate_type,
                       event.action,
                       &event.servo_angle,
                       &event.timestamp);
    
    if (parsed == 4) {
        Serial.print("[PARSE] Gate: ");
        Serial.print(event.gate_type);
        Serial.print(", Action: ");
        Serial.print(event.action);
        Serial.print(", Angle: ");
        Serial.print(event.servo_angle);
        Serial.print(", Timestamp: ");
        Serial.println(event.timestamp);
        
        // Validate gate type
        if (strcmp(event.gate_type, "GATE_IN") == 0 || 
            strcmp(event.gate_type, "GATE_OUT") == 0) {
            
            // Validate action
            if (strcmp(event.action, "OPEN") == 0 || 
                strcmp(event.action, "CLOSE") == 0) {
                
                handleServoEvent(event);
            } else {
                Serial.println("[ERROR] Invalid action");
            }
        } else {
            Serial.println("[ERROR] Invalid gate type");
        }
    } else {
        Serial.print("[ERROR] Parse failed. Parsed ");
        Serial.print(parsed);
        Serial.println(" fields");
    }
}

// =====================================================
// EVENT HANDLING
// =====================================================

void handleServoEvent(ServoEvent event) {
    Serial.println("[EVENT] Processing servo event...");
    
    // Use current server time if Arduino timestamp is too old
    unsigned long server_timestamp = millis() / 1000;
    
    // Send to server
    if (sendToServer(event)) {
        gateway_status.messages_sent++;
        Serial.println("[SUCCESS] Servo event sent to server");
        blinkLED(1);
    } else {
        gateway_status.messages_failed++;
        Serial.println("[FAILED] Could not send servo event to server");
    }
}

// =====================================================
// SERVER COMMUNICATION
// =====================================================

bool sendToServer(ServoEvent event) {
    if (!gateway_status.is_connected) {
        Serial.println("[ERROR] WiFi not connected");
        return false;
    }
    
    // Determine endpoint based on action
    char endpoint[64];
    if (strcmp(event.action, "OPEN") == 0) {
        strcpy(endpoint, "/api/servo/open");
    } else {
        strcpy(endpoint, "/api/servo/close");
    }
    
    // Build full URL
    char full_url[128];
    snprintf(full_url, sizeof(full_url), "%s%s", SERVER_URL, endpoint);
    
    Serial.print("[HTTP] Connecting to: ");
    Serial.println(full_url);
    
    HTTPClient http;
    http.begin(full_url);
    http.addHeader("Content-Type", "application/json");
    
    // Build JSON payload
    StaticJsonDocument<JSON_BUFFER_SIZE> doc;
    doc["gate_type"] = event.gate_type;
    doc["servo_angle"] = event.servo_angle;
    doc["timestamp"] = millis() / 1000;  // Current server time
    
    String json_payload;
    serializeJson(doc, json_payload);
    
    Serial.print("[JSON] Payload: ");
    Serial.println(json_payload);
    
    // Send POST request
    int http_code = http.POST(json_payload);
    
    String response = http.getString();
    
    http.end();
    
    Serial.print("[HTTP] Response code: ");
    Serial.println(http_code);
    Serial.print("[HTTP] Response: ");
    Serial.println(response);
    
    // Check if request was successful
    if (http_code == 201 || http_code == 200) {
        return true;
    } else {
        return false;
    }
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
