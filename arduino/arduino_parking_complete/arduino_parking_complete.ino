/*
 * =====================================================
 * SMART PARKING SYSTEM - ARDUINO MEGA (COMPLETE VERSION)
 * =====================================================
 * 
 * NO FreeRTOS - Simple & Reliable Architecture
 * 
 * Features:
 * - Bluetooth: Open/Close gates, Buzzer control
 * - LCD: Real-time parking slot status (Fill/Empty)
 * - Alarm: Smoke/Flame detection with buzzer alert
 * - Timer Interrupt: Bluetooth independent processing
 * - Non-blocking: All operations run simultaneously
 * 
 * Commands:
 * - "1" = Open GATE_IN
 * - "2" = Close GATE_IN
 * - "3" = Open GATE_OUT
 * - "4" = Close GATE_OUT
 * - "B" = Toggle Buzzer
 * - "S" = Status
 * - "?" = Help
 */

#include <Arduino.h>
#include <Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// =====================================================
// PIN DEFINITIONS
// =====================================================

#define SERVO_GATE_IN 2
#define SERVO_GATE_OUT 3

#define IR_SLOT_1 A0
#define IR_SLOT_2 A1
#define IR_SLOT_3 A2
#define IR_SLOT_4 A3
#define IR_SLOT_5 A4
#define IR_SLOT_6 A5
#define SMOKE_SENSOR A8
#define FLAME_SENSOR 22

#define BUZZER_PIN 24

#define BLUETOOTH_SERIAL Serial3
#define ESP32_SERIAL Serial1

// =====================================================
// CONSTANTS
// =====================================================

#define SERVO_OPEN_ANGLE 90
#define SERVO_CLOSE_ANGLE 0
#define SERVO_MOVE_DELAY 500
#define BLUETOOTH_BAUD 9600
#define ESP32_BAUD 19200

#define GATE_IN 1
#define GATE_OUT 2

// Alarm thresholds
#define SMOKE_THRESHOLD 400
#define FLAME_DETECTED 0  // Flame sensor is digital (LOW = detected)

// =====================================================
// GLOBAL VARIABLES
// =====================================================

// Servo objects
Servo servoGateIN;
Servo servoGateOUT;

// LCD object
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Servo states
uint8_t servo_in_position = 0;
uint8_t servo_out_position = 0;

// Parking slot states (0=empty, 1=filled)
uint8_t parking_slots[6] = {0, 0, 0, 0, 0, 0};

// Bluetooth buffer
char bt_buffer[64];
uint8_t bt_index = 0;

// System status
unsigned long system_start_time = 0;
uint32_t total_servo_operations = 0;

// Servo movement tracking (non-blocking)
unsigned long servo_move_start = 0;
uint8_t servo_moving = 0;

// Timing variables
unsigned long last_sensor_read = 0;
unsigned long last_lcd_update = 0;
unsigned long last_lcd_page_flip = 0;
uint8_t lcd_page = 0;
unsigned long last_heartbeat = 0;
unsigned long last_alarm_check = 0;

// Alarm states
uint8_t alarm_active = 0;
unsigned long alarm_start = 0;
uint8_t buzzer_enabled = 0;
uint8_t smoke_detected = 0;
uint8_t flame_detected = 0;

// =====================================================
// SETUP
// =====================================================

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println("SMART PARKING SYSTEM - COMPLETE VERSION");
    Serial.println("Arduino Mega (No FreeRTOS)");
    Serial.println("========================================\n");
    
    // Initialize pins
    pinMode(SERVO_GATE_IN, OUTPUT);
    pinMode(SERVO_GATE_OUT, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(FLAME_SENSOR, INPUT);
    pinMode(IR_SLOT_1, INPUT);
    pinMode(IR_SLOT_2, INPUT);
    pinMode(IR_SLOT_3, INPUT);
    pinMode(IR_SLOT_4, INPUT);
    pinMode(IR_SLOT_5, INPUT);
    pinMode(IR_SLOT_6, INPUT);
    pinMode(SMOKE_SENSOR, INPUT);
    
    digitalWrite(BUZZER_PIN, LOW);
    
    system_start_time = millis();
    
    // Initialize servos
    Serial.println("[INIT] Initializing servos...");
    servoGateIN.attach(SERVO_GATE_IN);
    servoGateOUT.attach(SERVO_GATE_OUT);
    servoGateIN.write(SERVO_CLOSE_ANGLE);
    servoGateOUT.write(SERVO_CLOSE_ANGLE);
    servo_in_position = SERVO_CLOSE_ANGLE;
    servo_out_position = SERVO_CLOSE_ANGLE;
    delay(500);
    Serial.println("[INIT] Servos initialized");
    
    // Initialize Bluetooth
    Serial.println("[INIT] Initializing Bluetooth...");
    BLUETOOTH_SERIAL.begin(BLUETOOTH_BAUD);
    delay(500);
    Serial.println("[INIT] Bluetooth initialized");
    
    // Initialize ESP32
    Serial.println("[INIT] Initializing ESP32...");
    ESP32_SERIAL.begin(ESP32_BAUD);
    delay(500);
    Serial.println("[INIT] ESP32 initialized");
    
    // Scan I2C
    Serial.println("[INIT] Scanning I2C devices...");
    Wire.begin();
    scanI2CAddress();
    
    // Initialize LCD
    Serial.println("[INIT] Initializing LCD...");
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("PARKING SYSTEM");
    lcd.setCursor(0, 1);
    lcd.print("Initialize...");
    delay(2000);
    lcd.clear();
    Serial.println("[INIT] LCD initialized");
    
    // Bluetooth will use polling in main loop (no ISR needed)
    Serial.println("[INIT] Bluetooth ready for polling");
    
    Serial.println("\n========================================");
    Serial.println("System Ready! All features active:");
    Serial.println("✓ Servo Control");
    Serial.println("✓ Bluetooth (Timer Interrupt)");
    Serial.println("✓ LCD Display (6 parking slots)");
    Serial.println("✓ Smoke/Flame Alarm");
    Serial.println("✓ ESP32 Gateway");
    Serial.println("========================================\n");
}

// =====================================================
// BLUETOOTH POLLING (No ISR - simpler & no timer conflict)
// =====================================================
// Bluetooth uses polling in main loop
// Hardware UART buffer handles independence

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
    unsigned long now = millis();
    
    // Handle servo movement (non-blocking)
    handleServoMovement();
    
    // Read parking sensors every 500ms
    if (now - last_sensor_read > 500) {
        last_sensor_read = now;
        readParkingSensors();
    }
    
    // Check alarms every 100ms
    if (now - last_alarm_check > 100) {
        last_alarm_check = now;
        checkAlarms();
    }
    
    // Update LCD every 100ms
    if (now - last_lcd_update > 100) {
        last_lcd_update = now;
        updateLCDDisplay();
    }
    
    // Check Bluetooth every 10ms (polling)
    handleBluetoothInput();
    
    // Heartbeat every 5 seconds
    if (now - last_heartbeat > 5000) {
        last_heartbeat = now;
        printHeartbeat();
    }
    
    delay(5);
}

// =====================================================
// BLUETOOTH HANDLER (ISR)
// =====================================================

void handleBluetoothInput() {
    if (BLUETOOTH_SERIAL.available()) {
        char c = BLUETOOTH_SERIAL.read();
        
        if (c == '\n' || c == '\r') {
            if (bt_index > 0) {
                bt_buffer[bt_index] = '\0';
                Serial.print("[BT-ISR] Received: ");
                Serial.println(bt_buffer);
                
                processBluetoothCommand(bt_buffer[0]);
                bt_index = 0;
                memset(bt_buffer, 0, sizeof(bt_buffer));
            }
        } else if (c >= 32 && c <= 126) {
            if (bt_index < sizeof(bt_buffer) - 1) {
                bt_buffer[bt_index++] = c;
            }
        }
    }
}

// =====================================================
// SERVO MANAGEMENT (Non-blocking)
// =====================================================

void handleServoMovement() {
    if (servo_moving == 0) return;
    
    unsigned long elapsed = millis() - servo_move_start;
    
    if (elapsed >= SERVO_MOVE_DELAY) {
        servo_moving = 0;
        Serial.println("[SERVO] Movement complete");
        total_servo_operations++;
    }
}

// =====================================================
// SENSOR READING
// =====================================================

void readParkingSensors() {
    // Read all 6 IR sensors (LOW = occupied, HIGH = empty)
    parking_slots[0] = !digitalRead(IR_SLOT_1);
    parking_slots[1] = !digitalRead(IR_SLOT_2);
    parking_slots[2] = !digitalRead(IR_SLOT_3);
    parking_slots[3] = !digitalRead(IR_SLOT_4);
    parking_slots[4] = !digitalRead(IR_SLOT_5);
    parking_slots[5] = !digitalRead(IR_SLOT_6);
}

void checkAlarms() {
    // Read smoke sensor (analog)
    int smoke_value = analogRead(SMOKE_SENSOR);
    smoke_detected = (smoke_value > SMOKE_THRESHOLD) ? 1 : 0;
    
    // Read flame sensor (digital)
    int flame_value = digitalRead(FLAME_SENSOR);
    flame_detected = (flame_value == FLAME_DETECTED) ? 1 : 0;
    
    // Trigger alarm if smoke OR flame detected
    if (smoke_detected || flame_detected) {
        if (alarm_active == 0) {
            // Alarm just started
            alarm_active = 1;
            alarm_start = millis();
            
            Serial.println("\n[ALARM] ALARM TRIGGERED!");
            if (smoke_detected) Serial.println("[ALARM] Smoke detected!");
            if (flame_detected) Serial.println("[ALARM] Flame detected!");
            
            BLUETOOTH_SERIAL.println("\n[ALARM] SYSTEM ALERT!");
            BLUETOOTH_SERIAL.println("Smoke or Flame detected!");
        }
        
        // Buzzer pattern: beep every 200ms
        unsigned long alarm_elapsed = millis() - alarm_start;
        if ((alarm_elapsed / 200) % 2 == 0) {
            digitalWrite(BUZZER_PIN, HIGH);
        } else {
            digitalWrite(BUZZER_PIN, LOW);
        }
    } else {
        if (alarm_active == 1) {
            // Alarm just stopped
            alarm_active = 0;
            digitalWrite(BUZZER_PIN, LOW);
            Serial.println("[ALARM] All sensors normal");
            BLUETOOTH_SERIAL.println("[OK] Alarm cleared\n");
        }
    }
}

// =====================================================
// LCD DISPLAY
// =====================================================

void updateLCDDisplay() {
    unsigned long now = millis();
    
    // Toggle page every 3 seconds to show all 6 slots with FILL/EMPTY
    if (now - last_lcd_page_flip > 3000) {
        last_lcd_page_flip = now;
        lcd_page = !lcd_page;
        lcd.clear(); 
    }
    
    if (lcd_page == 0) {
        // Page 1: Slots 1, 2, 3
        lcd.setCursor(0, 0);
        lcd.print("S1:"); lcd.print(parking_slots[0] ? "FILL " : "EMPTY");
        lcd.print(" S2:"); lcd.print(parking_slots[1] ? "FILL " : "EMPTY");
        
        lcd.setCursor(0, 1);
        lcd.print("S3:"); lcd.print(parking_slots[2] ? "FILL " : "EMPTY");
        if (alarm_active) lcd.print(" !!!");
        else lcd.print(" (1/2)");
    } else {
        // Page 2: Slots 4, 5, 6
        lcd.setCursor(0, 0);
        lcd.print("S4:"); lcd.print(parking_slots[3] ? "FILL " : "EMPTY");
        lcd.print(" S5:"); lcd.print(parking_slots[4] ? "FILL " : "EMPTY");
        
        lcd.setCursor(0, 1);
        lcd.print("S6:"); lcd.print(parking_slots[5] ? "FILL " : "EMPTY");
        if (alarm_active) lcd.print(" !!!");
        else lcd.print(" (2/2)");
    }
}

// =====================================================
// STATUS & HEARTBEAT
// =====================================================

void printHeartbeat() {
    unsigned long uptime = (millis() - system_start_time) / 1000;
    
    Serial.println("\n========== HEARTBEAT ==========");
    Serial.print("Uptime: ");
    Serial.print(uptime);
    Serial.println(" seconds");
    
    Serial.print("Parking: ");
    for (int i = 0; i < 6; i++) {
        Serial.print(parking_slots[i] ? "Fill" : "Empty");
        Serial.print(" ");
    }
    Serial.println();
    
    Serial.print("Gate IN: ");
    Serial.print(servo_in_position);
    Serial.print("° | Gate OUT: ");
    Serial.print(servo_out_position);
    Serial.println("°");
    
    Serial.print("Operations: ");
    Serial.println(total_servo_operations);
    
    Serial.print("Sensors - Smoke: ");
    Serial.print(analogRead(SMOKE_SENSOR));
    Serial.print(" | Flame: ");
    Serial.print(digitalRead(FLAME_SENSOR));
    Serial.println();
    
    Serial.println("=============================\n");
}

// =====================================================
// BLUETOOTH COMMANDS
// =====================================================

void processBluetoothCommand(char cmd) {
    // Lock during servo movement
    if (servo_moving != 0) {
        if (cmd >= '1' && cmd <= '4') {
            BLUETOOTH_SERIAL.println("[BUSY] Servo moving, wait...");
            return;
        }
    }
    
    switch (cmd) {
        case '1':
            // Open GATE_IN
            Serial.println("[CMD] Opening GATE_IN");
            servoGateIN.write(SERVO_OPEN_ANGLE);
            servo_in_position = SERVO_OPEN_ANGLE;
            servo_moving = GATE_IN;
            servo_move_start = millis();
            sendToESP32("GATE_IN", "OPEN", SERVO_OPEN_ANGLE);
            BLUETOOTH_SERIAL.println("[OK] GATE_IN opening...");
            break;
            
        case '2':
            // Close GATE_IN
            Serial.println("[CMD] Closing GATE_IN");
            servoGateIN.write(SERVO_CLOSE_ANGLE);
            servo_in_position = SERVO_CLOSE_ANGLE;
            servo_moving = GATE_IN;
            servo_move_start = millis();
            sendToESP32("GATE_IN", "CLOSE", SERVO_CLOSE_ANGLE);
            BLUETOOTH_SERIAL.println("[OK] GATE_IN closing...");
            break;
            
        case '3':
            // Open GATE_OUT
            Serial.println("[CMD] Opening GATE_OUT");
            servoGateOUT.write(SERVO_OPEN_ANGLE);
            servo_out_position = SERVO_OPEN_ANGLE;
            servo_moving = GATE_OUT;
            servo_move_start = millis();
            sendToESP32("GATE_OUT", "OPEN", SERVO_OPEN_ANGLE);
            BLUETOOTH_SERIAL.println("[OK] GATE_OUT opening...");
            break;
            
        case '4':
            // Close GATE_OUT
            Serial.println("[CMD] Closing GATE_OUT");
            servoGateOUT.write(SERVO_CLOSE_ANGLE);
            servo_out_position = SERVO_CLOSE_ANGLE;
            servo_moving = GATE_OUT;
            servo_move_start = millis();
            sendToESP32("GATE_OUT", "CLOSE", SERVO_CLOSE_ANGLE);
            BLUETOOTH_SERIAL.println("[OK] GATE_OUT closing...");
            break;
            
        case 'B':
            // Toggle Buzzer
            buzzer_enabled = !buzzer_enabled;
            if (buzzer_enabled && alarm_active == 0) {
                digitalWrite(BUZZER_PIN, HIGH);
                delay(200);
                digitalWrite(BUZZER_PIN, LOW);
                BLUETOOTH_SERIAL.println("[OK] Buzzer ON");
            } else if (alarm_active == 0) {
                digitalWrite(BUZZER_PIN, LOW);
                BLUETOOTH_SERIAL.println("[OK] Buzzer OFF");
            }
            break;
            
        case 'S':
            // Status
            displayStatus();
            break;
            
        case '?':
            // Help menu
            BLUETOOTH_SERIAL.println("\n=== COMMAND MENU ===");
            BLUETOOTH_SERIAL.println("1 = Open GATE_IN");
            BLUETOOTH_SERIAL.println("2 = Close GATE_IN");
            BLUETOOTH_SERIAL.println("3 = Open GATE_OUT");
            BLUETOOTH_SERIAL.println("4 = Close GATE_OUT");
            BLUETOOTH_SERIAL.println("B = Toggle Buzzer");
            BLUETOOTH_SERIAL.println("S = Status");
            BLUETOOTH_SERIAL.println("? = Help");
            BLUETOOTH_SERIAL.println("====================\n");
            break;
            
        default:
            BLUETOOTH_SERIAL.print("[?] Unknown: ");
            BLUETOOTH_SERIAL.println(cmd);
            break;
    }
}

void displayStatus() {
    unsigned long uptime = (millis() - system_start_time) / 1000;
    
    BLUETOOTH_SERIAL.println("\n======= SYSTEM STATUS =======");
    BLUETOOTH_SERIAL.print("Uptime: ");
    BLUETOOTH_SERIAL.print(uptime);
    BLUETOOTH_SERIAL.println("s");
    
    BLUETOOTH_SERIAL.print("GATE_IN: ");
    BLUETOOTH_SERIAL.print(servo_in_position);
    BLUETOOTH_SERIAL.println("°");
    
    BLUETOOTH_SERIAL.print("GATE_OUT: ");
    BLUETOOTH_SERIAL.print(servo_out_position);
    BLUETOOTH_SERIAL.println("°");
    
    BLUETOOTH_SERIAL.print("Operations: ");
    BLUETOOTH_SERIAL.println(total_servo_operations);
    
    BLUETOOTH_SERIAL.print("Parking: ");
    for (int i = 0; i < 6; i++) {
        BLUETOOTH_SERIAL.print(parking_slots[i] ? "F" : "E");
        BLUETOOTH_SERIAL.print(" ");
    }
    BLUETOOTH_SERIAL.println();
    
    BLUETOOTH_SERIAL.print("Smoke: ");
    BLUETOOTH_SERIAL.print(analogRead(SMOKE_SENSOR));
    BLUETOOTH_SERIAL.print(" | Flame: ");
    BLUETOOTH_SERIAL.println(digitalRead(FLAME_SENSOR) ? "OK" : "ALERT");
    
    BLUETOOTH_SERIAL.println("=============================\n");
}

void sendToESP32(const char* gate, const char* action, uint8_t angle) {
    unsigned long timestamp = millis() - system_start_time;
    char message[64];
    
    snprintf(message, sizeof(message), "$%s|%s|%d|%lu\n", gate, action, angle, timestamp);
    ESP32_SERIAL.print(message);
    
    Serial.print("[ESP32] Sent: ");
    Serial.print(message);
}

void scanI2CAddress() {
    byte error, address;
    int nDevices = 0;
    
    Serial.println("Scanning for I2C devices...");
    
    for (address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        error = Wire.endTransmission();
        
        if (error == 0) {
            Serial.print("I2C device found at 0x");
            if (address < 16) Serial.print("0");
            Serial.println(address, HEX);
            nDevices++;
        }
    }
    
    if (nDevices == 0) {
        Serial.println("No I2C devices found!");
    }
    Serial.println();
}

// =====================================================
// END
// =====================================================
