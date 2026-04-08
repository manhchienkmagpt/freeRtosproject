/*
 * =====================================================
 * SMART PARKING SYSTEM - ARDUINO MEGA WITH FreeRTOS
 * =====================================================
 * 
 * Complete Bluetooth-Controlled Parking System with FreeRTOS
 * 
 * System Architecture:
 * - Main Controller: Arduino Mega (2560)
 * - OS: FreeRTOS (Non-blocking, multi-tasking)
 * - Wireless Control: Bluetooth (HC-05)
 * - Gate Control: 2 Servo Motors (PWM pins 2,3)
 * - Gateway: ESP32 (for server notification)
 * - Parking Detection: 6 IR sensors
 * - Alarm System: Smoke/Flame detection with buzzer
 * - Display: LCD I2C 16x2 with paging
 * 
 * Features:
 * ✓ Servo Gate Control (Open/Close)
 * ✓ Bluetooth Command Processing
 * ✓ Parking Slot Status Monitoring (6 slots)
 * ✓ Buzzer Control (On/Off/Alert)
 * ✓ Smoke/Flame Detection & Alert
 * ✓ LCD Display with Paging
 * ✓ ESP32 Gateway Communication
 * ✓ Real-time Heartbeat Monitoring
 * 
 * FreeRTOS Task Schedule:
 * - TaskBluetooth: Priority 4 (Bluetooth input processing)
 * - TaskGateControl: Priority 3 (Servo motor control)
 * - TaskDisplayLCD: Priority 3 (LCD updates with paging)
 * - TaskCommunicationESP32: Priority 2 (ESP32 messaging)
 * - TaskAlarm: Priority 2 (Smoke/Flame detection & buzzer)
 * - TaskParkingSensor: Priority 1 (IR sensor reading)
 * - TaskSlotSync: Priority 1 (Parking slot sync to ESP32)
 * - TaskHeartbeat: Priority 1 (Status monitoring)
 * 
 * Bluetooth Commands:
 * - "1" = Open GATE_IN
 * - "2" = Close GATE_IN
 * - "3" = Open GATE_OUT
 * - "4" = Close GATE_OUT
 * - "B" = Toggle Buzzer (on/off/auto)
 * - "S" = System Status
 * - "?" = Help menu
 * 
 * ESP32 Message Formats:
 * - Servo: "$SERVO|{gate}|{action}|{angle}|{timestamp}"
 * - Slots: "$SLOTS|s1,s2,s3,s4,s5,s6|{timestamp}"
 * - Alarm: "$ALARM|{type}|{value}|{timestamp}"
 */

#include <Arduino.h>
#include <Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// =====================================================
// FREERTOS INCLUDES
// =====================================================
#include <Arduino_FreeRTOS.h>
#include <task.h>
#include <queue.h>
#include <event_groups.h>
#include <semphr.h>

// =====================================================
// PIN DEFINITIONS
// =====================================================

// Servo Motors (PWM pins)
#define SERVO_GATE_IN 2    // PWM pin for Gate IN
#define SERVO_GATE_OUT 3   // PWM pin for Gate OUT

// Sensors (kept for compatibility - not used)
#define IR_SLOT_1 A0
#define IR_SLOT_2 A1
#define IR_SLOT_3 A2
#define IR_SLOT_4 A3
#define IR_SLOT_5 A4
#define IR_SLOT_6 A5
#define SMOKE_SENSOR A8
#define FLAME_SENSOR 22

// Buttons (kept for compatibility - not used)
#define BTN_OPEN_IN 25
#define BTN_OPEN_OUT 26
#define BTN_ALARM 27

// Buzzer (kept for compatibility - not used)
#define BUZZER_PIN 24

// HC-05 Bluetooth (Serial3: RX3=15, TX3=14)
#define BLUETOOTH_SERIAL Serial3

// ESP32 Communication (UART1: RX1=19, TX1=18)
#define ESP32_SERIAL Serial1

// =====================================================
// CONSTANTS & CONFIGURATION
// =====================================================

#define SERVO_OPEN_ANGLE 90      // Servo position when open
#define SERVO_CLOSE_ANGLE 0      // Servo position when closed
#define SERVO_MOVE_DELAY 500     // Delay for servo movement (ms)
#define BLUETOOTH_BAUD 9600      // HC-05 baud rate
#define ESP32_BAUD 19200         // ESP32 gateway baud rate
#define GATE_IN 1
#define GATE_OUT 2

// Alarm thresholds
#define SMOKE_THRESHOLD 400      // MQ2 smoke sensor threshold
#define FLAME_DETECTED 0         // Flame sensor: LOW = detected

// Alarm beep pattern
#define ALARM_BEEP_INTERVAL 200  // Beep every 200ms

// =====================================================
// DATA STRUCTURES
// =====================================================

typedef struct {
    uint8_t gate_id;        // 1 = GATE_IN, 2 = GATE_OUT
    char gate_name[12];     // "GATE_IN" or "GATE_OUT"
    uint8_t action;         // 1 = OPEN, 0 = CLOSE
    uint8_t servo_angle;    // Current servo angle (0-180)
    unsigned long timestamp;
    char status[16];        // "SUCCESS" or "FAILED"
} ServoEvent;

// =====================================================
// GLOBAL VARIABLES
// =====================================================

// Servo objects
Servo servoGateIN;
Servo servoGateOUT;

// LCD object (I2C address 0x27, 16x2)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Servo states
uint8_t servo_in_position = 0;   // Current position (0=closed, 90=open)
uint8_t servo_out_position = 0;  // Current position (0=closed, 90=open)

// Parking slot states (0=empty, 1=filled)
uint8_t parking_slots[6] = {0, 0, 0, 0, 0, 0};
uint8_t last_parking_slots[6] = {0, 0, 0, 0, 0, 0};  // Track changes for sync

// LCD display screen rotation
uint8_t display_screen = 0;  // 0=gates, 1=parking slots 1-3, 2=parking slots 4-6

// Bluetooth buffer
char bt_buffer[64];
uint8_t bt_index = 0;

// FreeRTOS synchronization
SemaphoreHandle_t servoMutex;
QueueHandle_t servoEventQueue;

// System status
unsigned long system_start_time = 0;
uint32_t total_servo_operations = 0;
bool esp32_connected = false;

// Alarm system (new)
uint8_t alarm_active = 0;
unsigned long alarm_start = 0;
int last_smoke_value = 0;
int last_flame_value = 0;
uint8_t smoke_detected = 0;
uint8_t flame_detected = 0;

// Buzzer control (new)
uint8_t buzzer_enabled = 0;  // 0=off, 1=on, 2=auto (alarm only)

// =====================================================
// PROTOTYPES
// =====================================================

void TaskBluetooth(void *pvParameters);
void TaskGateControl(void *pvParameters);
void TaskCommunicationESP32(void *pvParameters);
void TaskAlarm(void *pvParameters);
void TaskDisplayLCD(void *pvParameters);
void TaskParkingSensor(void *pvParameters);
void TaskHeartbeat(void *pvParameters);
void TaskSlotSync(void *pvParameters);
void TaskBuzzer(void *pvParameters);

void initializeServos();
void initializeBluetooth();
void initializeESP32();
void initializeLCD();
void scanI2CAddress();
void processBluetoothCommand(char cmd);
void sendServoEvent(ServoEvent event);
void displayStatus();
void displayLCDStatus();
void sendAlarmToESP32(const char* type, int value);
void syncParkingSlotsWithESP32();

// =====================================================
// SETUP
// =====================================================

void setup() {
    // Initialize serial for debugging (Serial0)
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println("SMART PARKING SYSTEM - START UP");
    Serial.println("Bluetooth-Only Servo Control");
    Serial.println("========================================\n");
    
    // Initialize pins
    pinMode(SERVO_GATE_IN, OUTPUT);
    pinMode(SERVO_GATE_OUT, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(FLAME_SENSOR, INPUT);
    
    // Initialize for sensors (kept for compatibility)
    pinMode(IR_SLOT_1, INPUT);
    pinMode(IR_SLOT_2, INPUT);
    pinMode(IR_SLOT_3, INPUT);
    pinMode(IR_SLOT_4, INPUT);
    pinMode(IR_SLOT_5, INPUT);
    pinMode(IR_SLOT_6, INPUT);
    pinMode(SMOKE_SENSOR, INPUT);
    
    system_start_time = millis();
    
    // Initialize servos
    initializeServos();
    Serial.println("[SETUP] Servos initialized");
    
    // Initialize Bluetooth
    initializeBluetooth();
    Serial.println("[SETUP] Bluetooth initialized at 9600 baud");
    
    // Initialize ESP32 communication
    initializeESP32();
    Serial.println("[SETUP] ESP32 communication initialized at 19200 baud");
    
    // Scan I2C devices before initializing LCD
    Serial.println("\n[SETUP] Scanning I2C devices...");
    Wire.begin();
    scanI2CAddress();
    
    // Initialize LCD
    initializeLCD();
    Serial.println("[SETUP] LCD initialized");
    
    // Create mutex for servo control
    servoMutex = xSemaphoreCreateMutex();
    
    // Create queue for servo events (max 20 events)
    servoEventQueue = xQueueCreate(20, sizeof(ServoEvent));
    
    // Create FreeRTOS tasks
    Serial.println("\n[SETUP] Creating FreeRTOS tasks...");
    
    xTaskCreate(TaskBluetooth, "BT", 256, NULL, 4, NULL);
    Serial.println("[SETUP] TaskBluetooth created");
    
    xTaskCreate(TaskGateControl, "GATE", 256, NULL, 3, NULL);
    Serial.println("[SETUP] TaskGateControl created");
    
    xTaskCreate(TaskDisplayLCD, "LCD", 256, NULL, 3, NULL);
    Serial.println("[SETUP] TaskDisplayLCD created");
    
    xTaskCreate(TaskParkingSensor, "PARK", 128, NULL, 1, NULL);
    Serial.println("[SETUP] TaskParkingSensor created");
    
    xTaskCreate(TaskCommunicationESP32, "ESP32", 256, NULL, 2, NULL);
    Serial.println("[SETUP] TaskCommunicationESP32 created");
    
    xTaskCreate(TaskAlarm, "ALARM", 128, NULL, 2, NULL);
    Serial.println("[SETUP] TaskAlarm created");
    
    xTaskCreate(TaskSlotSync, "SYNC", 128, NULL, 1, NULL);
    Serial.println("[SETUP] TaskSlotSync created");
    
    xTaskCreate(TaskBuzzer, "BUZZ", 128, NULL, 2, NULL);
    Serial.println("[SETUP] TaskBuzzer created");
    
    xTaskCreate(TaskHeartbeat, "HB", 128, NULL, 1, NULL);
    Serial.println("[SETUP] TaskHeartbeat created");
    
    Serial.println("\n========================================");
    Serial.println("All tasks started! System is RUNNING!");
    Serial.println("========================================\n");
}

// =====================================================
// LOOP (Minimal - FreeRTOS scheduler controls execution)
// =====================================================

void loop() {
    // Empty - FreeRTOS scheduler runs tasks
    vTaskDelay(pdMS_TO_TICKS(1000));
}

// =====================================================
// INITIALIZATION FUNCTIONS
// =====================================================

void scanI2CAddress() {
    byte error, address;
    int nDevices = 0;
    
    Serial.println("Scanning for I2C devices...");
    
    for (address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        error = Wire.endTransmission();
        
        if (error == 0) {
            Serial.print("I2C device found at address 0x");
            if (address < 16)
                Serial.print("0");
            Serial.print(address, HEX);
            Serial.println(" - This is your LCD address!");
            nDevices++;
        }
        else if (error == 4) {
            Serial.print("Unknown error at address 0x");
            if (address < 16)
                Serial.print("0");
            Serial.println(address, HEX);
        }
    }
    
    if (nDevices == 0)
        Serial.println("No I2C devices found. Check connections!");
    else
        Serial.println("I2C scan complete.\n");
}

void initializeServos() {
    servoGateIN.attach(SERVO_GATE_IN);
    servoGateOUT.attach(SERVO_GATE_OUT);
    
    // Set initial position (closed)
    servoGateIN.write(SERVO_CLOSE_ANGLE);
    servoGateOUT.write(SERVO_CLOSE_ANGLE);
    
    servo_in_position = SERVO_CLOSE_ANGLE;
    servo_out_position = SERVO_CLOSE_ANGLE;
    
    delay(500);
}

void initializeBluetooth() {
    BLUETOOTH_SERIAL.begin(BLUETOOTH_BAUD);
    delay(500);
}

void initializeESP32() {
    ESP32_SERIAL.begin(ESP32_BAUD);
    delay(500);
}

void initializeLCD() {
    Serial.println("[LCD] Initializing LCD display...");
    
    // Try to initialize LCD
    lcd.init();
    Serial.println("[LCD] LCD init() called");
    
    lcd.backlight();
    Serial.println("[LCD] Backlight enabled");
    
    // Display test message
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("TEST123");
    
    Serial.println("[LCD] Test message written to LCD");
    Serial.println("[LCD] If you see 'TEST123' on LCD, it's working!");
    
    // IMPORTANT: Don't clear after this - let TaskDisplayLCD handle it
    // Delay to see test message
    delay(2000);
}

// =====================================================
// FREERTOS TASKS
// =====================================================

// ========== TaskBluetooth ==========
void TaskBluetooth(void *pvParameters) {
    unsigned long last_log = 0;
    
    Serial.println("[BT] TaskBluetooth started!");
    
    for (;;) {
        if (BLUETOOTH_SERIAL.available()) {
            char c = BLUETOOTH_SERIAL.read();
            
            if (c == '\n' || c == '\r') {
                if (bt_index > 0) {
                    bt_buffer[bt_index] = '\0';
                    Serial.print("[BT] Received: ");
                    Serial.println(bt_buffer);
                    
                    processBluetoothCommand(bt_buffer[0]);
                    bt_index = 0;
                    memset(bt_buffer, 0, sizeof(bt_buffer));
                }
            } else if (c >= 32 && c <= 126) {  // Printable characters only
                if (bt_index < sizeof(bt_buffer) - 1) {
                    bt_buffer[bt_index++] = c;
                }
            }
        }
        
        // Keep-alive message every 30 seconds
        if (millis() - last_log > 30000) {
            last_log = millis();
            Serial.println("[BT] TaskBluetooth still running");
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ========== TaskGateControl ==========
void TaskGateControl(void *pvParameters) {
    ServoEvent event;
    
    Serial.println("[GATE] TaskGateControl started!");
    
    for (;;) {
        // Check if there's a servo event in the queue
        if (xQueueReceive(servoEventQueue, &event, pdMS_TO_TICKS(100))) {
            
            if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(1000))) {
                Serial.print("[GATE] Processing: ");
                Serial.print(event.gate_name);
                Serial.print(" - ");
                Serial.println(event.action == 1 ? "OPEN" : "CLOSE");
                
                // Control servo based on gate
                if (event.gate_id == GATE_IN) {
                    servoGateIN.write(event.servo_angle);
                    servo_in_position = event.servo_angle;
                } else if (event.gate_id == GATE_OUT) {
                    servoGateOUT.write(event.servo_angle);
                    servo_out_position = event.servo_angle;
                }
                
                // Wait for servo to reach position
                vTaskDelay(pdMS_TO_TICKS(SERVO_MOVE_DELAY));
                
                // Mark as success
                strcpy(event.status, "SUCCESS");
                total_servo_operations++;
                
                // Send event to ESP32 queue
                xQueueSend(servoEventQueue, &event, 0);
                
                xSemaphoreGive(servoMutex);
            }
        }
        
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ========== TaskCommunicationESP32 ==========
void TaskCommunicationESP32(void *pvParameters) {
    ServoEvent event;
    
    Serial.println("[ESP32] TaskCommunicationESP32 started!");
    
    for (;;) {
        // Check if there's a servo event to send
        if (xQueueReceive(servoEventQueue, &event, pdMS_TO_TICKS(1000))) {
            
            // Prepare message for ESP32
            char esp32_message[64];
            
            char* gate_str = (event.gate_id == GATE_IN) ? "GATE_IN" : "GATE_OUT";
            char* action_str = (event.action == 1) ? "OPEN" : "CLOSE";
            
            snprintf(esp32_message, sizeof(esp32_message), 
                     "$%s|%s|%d|%lu\n",
                     gate_str, action_str, event.servo_angle, event.timestamp);
            
            // Send to ESP32
            ESP32_SERIAL.print(esp32_message);
            
            Serial.print("[ESP32] Sent: ");
            Serial.print(esp32_message);
            
            vTaskDelay(pdMS_TO_TICKS(100));
        }
        
        // Don't block indefinitely
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ========== TaskAlarm ==========
// Detects smoke and flame, triggers alarm and buzzer
void TaskAlarm(void *pvParameters) {
    unsigned long last_log = 0;
    
    Serial.println("[ALARM] TaskAlarm started!");
    
    for (;;) {
        // Read smoke sensor (analog)
        last_smoke_value = analogRead(SMOKE_SENSOR);
        smoke_detected = (last_smoke_value > SMOKE_THRESHOLD) ? 1 : 0;
        
        // Read flame sensor (digital)
        last_flame_value = digitalRead(FLAME_SENSOR);
        flame_detected = (last_flame_value == FLAME_DETECTED) ? 1 : 0;
        
        // Check if alarm should be triggered
        if (smoke_detected || flame_detected) {
            // Alarm triggered
            if (alarm_active == 0) {
                alarm_active = 1;
                alarm_start = millis();
                
                Serial.println("\n[ALARM] ALARM TRIGGERED!");
                if (smoke_detected) Serial.println("[ALARM] Smoke detected!");
                if (flame_detected) Serial.println("[ALARM] Flame detected!");
                
                BLUETOOTH_SERIAL.println("\n[ALARM] SYSTEM ALERT!");
                if (smoke_detected) BLUETOOTH_SERIAL.println("Smoke detected!");
                if (flame_detected) BLUETOOTH_SERIAL.println("Flame detected!");
                
                // Send alarm to ESP32
                sendAlarmToESP32(smoke_detected ? "SMOKE" : "FLAME", 
                                smoke_detected ? last_smoke_value : 1);
            }
        } else {
            // Alarm cleared
            if (alarm_active == 1) {
                alarm_active = 0;
                digitalWrite(BUZZER_PIN, LOW);
                Serial.println("[ALARM] All sensors normal");
                BLUETOOTH_SERIAL.println("[OK] Alarm cleared\n");
            }
        }
        
        // Log every 10 seconds
        if (millis() - last_log > 10000) {
            last_log = millis();
            Serial.print("[ALARM] Status - Smoke: ");
            Serial.print(last_smoke_value);
            Serial.print(" | Flame: ");
            Serial.print(last_flame_value);
            Serial.print(" | Active: ");
            Serial.println(alarm_active ? "YES" : "NO");
        }
        
        // Check every 100ms
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// ========== TaskHeartbeat ==========
// This task proves Arduino is running by printing to Serial
void TaskHeartbeat(void *pvParameters) {
    unsigned long counter = 0;
    
    for (;;) {
        counter++;
        
        // Print heartbeat every 3 seconds
        Serial.println("\n========== HEARTBEAT ==========");
        Serial.print("System uptime: ");
        Serial.print((millis() / 1000));
        Serial.println(" seconds");
        Serial.print("Parking slots: ");
        for (int i = 0; i < 6; i++) {
            Serial.print(parking_slots[i] ? "F" : "E");
            Serial.print(" ");
        }
        Serial.println();
        Serial.print("Gate IN position: ");
        Serial.print(servo_in_position);
        Serial.println("°");
        Serial.print("Gate OUT position: ");
        Serial.print(servo_out_position);
        Serial.println("°");
        Serial.println("=============================\n");
        
        // Button feedback
        digitalWrite(BUZZER_PIN, HIGH);
        vTaskDelay(pdMS_TO_TICKS(100));
        digitalWrite(BUZZER_PIN, LOW);
        
        vTaskDelay(pdMS_TO_TICKS(3000));  // Print every 3 seconds
    }
}

// ========== TaskParkingSensor ==========
// INDEPENDENT - Reads IR sensors and updates parking_slots array
void TaskParkingSensor(void *pvParameters) {
    unsigned long last_log = 0;
    
    Serial.println("[SENSOR] TaskParkingSensor started!");
    
    for (;;) {
        // Read all 6 IR sensors for parking slots
        // IR sensor: LOW = occupied (metal detected), HIGH = empty
        parking_slots[0] = !digitalRead(IR_SLOT_1);  // Slot 1
        parking_slots[1] = !digitalRead(IR_SLOT_2);  // Slot 2
        parking_slots[2] = !digitalRead(IR_SLOT_3);  // Slot 3
        parking_slots[3] = !digitalRead(IR_SLOT_4);  // Slot 4
        parking_slots[4] = !digitalRead(IR_SLOT_5);  // Slot 5
        parking_slots[5] = !digitalRead(IR_SLOT_6);  // Slot 6
        
        // Log every 10 seconds
        if (millis() - last_log > 10000) {
            last_log = millis();
            Serial.print("[SENSOR] Parking slots: ");
            for (int i = 0; i < 6; i++) {
                Serial.print(parking_slots[i] ? "F" : "E");
                Serial.print(" ");
            }
            Serial.println();
        }
        
        // Check every 500ms
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

// ========== TaskDisplayLCD ==========
// Display with paging: 0=gates, 1=parking slots 1-3, 2=parking slots 4-6
void TaskDisplayLCD(void *pvParameters) {
    unsigned long last_page_flip = 0;
    unsigned long last_log = 0;
    
    Serial.println("[LCD] TaskDisplayLCD started!");
    
    // Initial clear
    lcd.clear();
    
    for (;;) {
        // Flip page every 3 seconds
        if (millis() - last_page_flip > 3000) {
            last_page_flip = millis();
            display_screen = (display_screen + 1) % 3;
            lcd.clear();
        }
        
        // Update display based on current page
        if (display_screen == 0) {
            // Page 0: Gate positions
            lcd.setCursor(0, 0);
            lcd.print("IN:");
            lcd.print(servo_in_position);
            lcd.print("o OUT:");
            lcd.print(servo_out_position);
            lcd.print("o");
            
            lcd.setCursor(0, 1);
            if (alarm_active) {
                lcd.print("ALARM!!!");
            } else {
                lcd.print("(Page 1/3)");
            }
        } 
        else if (display_screen == 1) {
            // Page 1: Slots 1-3
            lcd.setCursor(0, 0);
            lcd.print("S1:");
            lcd.print(parking_slots[0] ? "FILL " : "EMPTY");
            lcd.print("S2:");
            lcd.print(parking_slots[1] ? "FILL" : "EMPT");
            
            lcd.setCursor(0, 1);
            lcd.print("S3:");
            lcd.print(parking_slots[2] ? "FILL " : "EMPTY");
            if (alarm_active) {
                lcd.print(" !!!");
            } else {
                lcd.print(" (2/3)");
            }
        } 
        else if (display_screen == 2) {
            // Page 2: Slots 4-6
            lcd.setCursor(0, 0);
            lcd.print("S4:");
            lcd.print(parking_slots[3] ? "FILL " : "EMPTY");
            lcd.print("S5:");
            lcd.print(parking_slots[4] ? "FILL" : "EMPT");
            
            lcd.setCursor(0, 1);
            lcd.print("S6:");
            lcd.print(parking_slots[5] ? "FILL " : "EMPTY");
            if (alarm_active) {
                lcd.print(" !!!");
            } else {
                lcd.print(" (3/3)");
            }
        }
        
        // Log every 15 seconds
        if (millis() - last_log > 15000) {
            last_log = millis();
            Serial.print("[LCD] Page ");
            Serial.print(display_screen);
            Serial.println(" updated");
        }
        
        // Update every 100ms
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// =====================================================
// COMMAND PROCESSING
// =====================================================

void processBluetoothCommand(char cmd) {
    ServoEvent event;
    event.timestamp = millis() - system_start_time;
    event.servo_angle = 0;
    strcpy(event.status, "PENDING");
    
    switch (cmd) {
        case '1':
            // Open GATE_IN
            event.gate_id = GATE_IN;
            strcpy(event.gate_name, "GATE_IN");
            event.action = 1;
            event.servo_angle = SERVO_OPEN_ANGLE;
            BLUETOOTH_SERIAL.println("[GATE_IN] Opening");
            xQueueSend(servoEventQueue, &event, 0);
            break;
            
        case '2':
            // Close GATE_IN
            event.gate_id = GATE_IN;
            strcpy(event.gate_name, "GATE_IN");
            event.action = 0;
            event.servo_angle = SERVO_CLOSE_ANGLE;
            BLUETOOTH_SERIAL.println("[GATE_IN] Closing");
            xQueueSend(servoEventQueue, &event, 0);
            break;
            
        case '3':
            // Open GATE_OUT
            event.gate_id = GATE_OUT;
            strcpy(event.gate_name, "GATE_OUT");
            event.action = 1;
            event.servo_angle = SERVO_OPEN_ANGLE;
            BLUETOOTH_SERIAL.println("[GATE_OUT] Opening");
            xQueueSend(servoEventQueue, &event, 0);
            break;
            
        case '4':
            // Close GATE_OUT
            event.gate_id = GATE_OUT;
            strcpy(event.gate_name, "GATE_OUT");
            event.action = 0;
            event.servo_angle = SERVO_CLOSE_ANGLE;
            BLUETOOTH_SERIAL.println("[GATE_OUT] Closing");
            xQueueSend(servoEventQueue, &event, 0);
            break;
            
        case 'B':
            // Toggle Buzzer
            buzzer_enabled = !buzzer_enabled;
            if (buzzer_enabled) {
                // Beep to confirm ON
                digitalWrite(BUZZER_PIN, HIGH);
                vTaskDelay(pdMS_TO_TICKS(200));
                digitalWrite(BUZZER_PIN, LOW);
                BLUETOOTH_SERIAL.println("[OK] Buzzer ON");
                Serial.println("[CMD] Buzzer enabled");
            } else {
                digitalWrite(BUZZER_PIN, LOW);
                BLUETOOTH_SERIAL.println("[OK] Buzzer OFF");
                Serial.println("[CMD] Buzzer disabled");
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
            BLUETOOTH_SERIAL.print("[?] Unknown command: ");
            BLUETOOTH_SERIAL.println(cmd);
            break;
    }
}

// =====================================================
// STATUS DISPLAY
// =====================================================

void displayStatus() {
    unsigned long uptime = (millis() - system_start_time) / 1000;
    
    BLUETOOTH_SERIAL.println("\n========== SYSTEM STATUS ==========");
    BLUETOOTH_SERIAL.print("Uptime: ");
    BLUETOOTH_SERIAL.print(uptime);
    BLUETOOTH_SERIAL.println(" seconds");
    
    BLUETOOTH_SERIAL.print("GATE_IN position: ");
    BLUETOOTH_SERIAL.print(servo_in_position);
    BLUETOOTH_SERIAL.println("°");
    
    BLUETOOTH_SERIAL.print("GATE_OUT position: ");
    BLUETOOTH_SERIAL.print(servo_out_position);
    BLUETOOTH_SERIAL.println("°");
    
    BLUETOOTH_SERIAL.print("Total operations: ");
    BLUETOOTH_SERIAL.println(total_servo_operations);
    
    BLUETOOTH_SERIAL.print("Parking: ");
    for (int i = 0; i < 6; i++) {
        BLUETOOTH_SERIAL.print(parking_slots[i] ? "F" : "E");
        BLUETOOTH_SERIAL.print(" ");
    }
    BLUETOOTH_SERIAL.println();
    
    BLUETOOTH_SERIAL.print("Smoke Sensor: ");
    BLUETOOTH_SERIAL.print(analogRead(SMOKE_SENSOR));
    BLUETOOTH_SERIAL.print(" | Flame: ");
    BLUETOOTH_SERIAL.println(digitalRead(FLAME_SENSOR) ? "OK" : "ALERT");
    
    BLUETOOTH_SERIAL.print("Alarm: ");
    BLUETOOTH_SERIAL.println(alarm_active ? "ACTIVE" : "NORMAL");
    
    BLUETOOTH_SERIAL.print("Buzzer: ");
    BLUETOOTH_SERIAL.println(buzzer_enabled ? "ON" : "OFF");
    
    BLUETOOTH_SERIAL.println("====================================\n");
}

// ========== TaskBuzzer ==========
// Handles buzzer control: manual on/off and automatic alarm beeping
void TaskBuzzer(void *pvParameters) {
    unsigned long last_log = 0;
    
    Serial.println("[BUZZ] TaskBuzzer started!");
    
    for (;;) {
        // If manual buzzer is ON, keep it ON
        if (buzzer_enabled && alarm_active == 0) {
            digitalWrite(BUZZER_PIN, HIGH);
        }
        // If alarm is active, beep pattern
        else if (alarm_active) {
            unsigned long alarm_elapsed = millis() - alarm_start;
            // Beep pattern: 200ms on, 200ms off
            if ((alarm_elapsed / ALARM_BEEP_INTERVAL) % 2 == 0) {
                digitalWrite(BUZZER_PIN, HIGH);
            } else {
                digitalWrite(BUZZER_PIN, LOW);
            }
        }
        // Otherwise buzzer is OFF
        else {
            digitalWrite(BUZZER_PIN, LOW);
        }
        
        // Log every 10 seconds
        if (millis() - last_log > 10000) {
            last_log = millis();
            Serial.print("[BUZZ] State - Manual: ");
            Serial.print(buzzer_enabled ? "ON" : "OFF");
            Serial.print(" | Alarm: ");
            Serial.println(alarm_active ? "ACTIVE" : "NORMAL");
        }
        
        // Update every 50ms for smooth beeping
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ========== TaskSlotSync ==========
// Synchronizes parking slot status with ESP32
void TaskSlotSync(void *pvParameters) {
    unsigned long last_sync = 0;
    unsigned long last_log = 0;
    
    Serial.println("[SYNC] TaskSlotSync started!");
    
    for (;;) {
        // Check if any slot state changed
        bool changed = false;
        for (int i = 0; i < 6; i++) {
            if (parking_slots[i] != last_parking_slots[i]) {
                changed = true;
                last_parking_slots[i] = parking_slots[i];
            }
        }
        
        // Sync every 2 seconds OR on change
        if (changed || (millis() - last_sync > 2000)) {
            syncParkingSlotsWithESP32();
            last_sync = millis();
        }
        
        // Log every 15 seconds
        if (millis() - last_log > 15000) {
            last_log = millis();
            Serial.print("[SYNC] Parking slots: ");
            for (int i = 0; i < 6; i++) {
                Serial.print(parking_slots[i] ? "F" : "E");
                Serial.print(" ");
            }
            Serial.println();
        }
        
        // Check every 500ms
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

void sendAlarmToESP32(const char* type, int value) {
    char message[64];
    // Format: $ALARM|type|value|timestamp
    snprintf(message, sizeof(message), "$ALARM|%s|%d|%lu\n", type, value, millis());
    ESP32_SERIAL.print(message);
    Serial.print("[ESP32-ALARM] Sent: ");
    Serial.println(message);
}

void syncParkingSlotsWithESP32() {
    char message[128];
    // Format: $SLOTS|s1,s2,s3,s4,s5,s6|timestamp
    snprintf(message, sizeof(message), "$SLOTS|%d,%d,%d,%d,%d,%d|%lu\n", 
        parking_slots[0], parking_slots[1], parking_slots[2], 
        parking_slots[3], parking_slots[4], parking_slots[5], millis());
    ESP32_SERIAL.print(message);
    Serial.print("[ESP32-SLOTS] Sync: ");
    Serial.println(message);
}

// =====================================================
// END OF SMART PARKING SYSTEM - FreeRTOS VERSION
// =====================================================
