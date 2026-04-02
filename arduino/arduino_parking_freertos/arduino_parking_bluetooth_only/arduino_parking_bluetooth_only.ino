/*
 * =====================================================
 * SMART PARKING SYSTEM - ARDUINO MEGA WITH FreeRTOS (SIMPLIFIED)
 * =====================================================
 * 
 * Bluetooh-Only Servo Control Version
 * 
 * System Architecture:
 * - Main Controller: Arduino Mega (2560)
 * - OS: FreeRTOS
 * - Wireless Control: Bluetooth (HC-05)
 * - Gate Control: 2 Servo Motors (PWM)
 * - Gateway: ESP32 (for server notification)
 * 
 * REMOVED COMPONENTS:
 * - RFID readers (RC522 modules)
 * - RFID authentication tasks
 * 
 * KEPT COMPONENTS:
 * - Servo Motors: 2 (Gate IN, Gate OUT) - PWM pins 2,3
 * - Bluetooth: HC-05 (Serial3: pins 14,15)
 * - ESP32: Gateway via UART1 (pins 18,19)
 * - IR Sensors: 6 parking slots (A0-A5) - unused but kept
 * - LCD: I2C 16x2 (pins 20,21) - unused but kept
 * - Smoke Sensor: MQ2 (A8) - unused but kept
 * - Flame Sensor: Digital (pin 22) - unused but kept
 * - Buttons: 3 buttons - unused but kept
 * - Buzzer: Digital PWM - unused but kept
 * 
 * Task Schedule:
 * - TaskBluetooth: Priority 4 (Bluetooth command processing)
 * - TaskGateControl: Priority 3 (Servo motor control)
 * - TaskCommunicationESP32: Priority 2 (Send events to ESP32)
 * - TaskAlarm: Priority 1 (Smoke/Flame detection - future)
 * 
 * Command Format (Bluetooth):
 * - "1" = Open GATE_IN servo
 * - "2" = Close GATE_IN servo
 * - "3" = Open GATE_OUT servo
 * - "4" = Close GATE_OUT servo
 * - "S" = Request system status
 * - "?" = Help menu
 * 
 * ESP32 Message Format (UART1 at 19200 baud):
 * - "${gate_type}|{action}|{angle}|{timestamp}"
 * - Example: "GATE_IN|OPEN|90|1234567890"
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

void initializeServos();
void initializeBluetooth();
void initializeESP32();
void initializeLCD();
void scanI2CAddress();
void processBluetoothCommand(char cmd);
void sendServoEvent(ServoEvent event);
void displayStatus();
void displayLCDStatus();

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
    
    xTaskCreate(TaskAlarm, "ALARM", 128, NULL, 1, NULL);
    Serial.println("[SETUP] TaskAlarm created");
    
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
void TaskAlarm(void *pvParameters) {
    for (;;) {
        // Read smoke and flame sensors (kept for future use)
        int smoke_value = analogRead(SMOKE_SENSOR);
        int flame_state = digitalRead(FLAME_SENSOR);
        
        // Not used in current version
        vTaskDelay(pdMS_TO_TICKS(5000));  // Check every 5 seconds
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
// INDEPENDENT TASK - ONLY READS parking_slots[], NO DEPENDENCIES
void TaskDisplayLCD(void *pvParameters) {
    unsigned long last_log = 0;
    
    Serial.println("[LCD] TaskDisplayLCD started!");
    
    // Initial clear
    lcd.clear();
    
    for (;;) {
        // Row 0: Status line
        lcd.setCursor(0, 0);
        
        // Column 0-3: Slot 1-2
        lcd.print("1:");
        lcd.print(parking_slots[0] ? "F" : "E");
        lcd.print(" 2:");
        lcd.print(parking_slots[1] ? "F" : "E");
        
        // Column 5-8: Slot 3-4
        lcd.print(" 3:");
        lcd.print(parking_slots[2] ? "F" : "E");
        
        // Row 1: Status line
        lcd.setCursor(0, 1);
        
        // Column 0-3: Slot 5
        lcd.print(" 4:");
        lcd.print(parking_slots[3] ? "F" : "E");
        lcd.print(" 5:");
        lcd.print(parking_slots[4] ? "F" : "E");
        lcd.print(" 6:");
        lcd.print(parking_slots[5] ? "F" : "E");
        
        // Log every 10 seconds
        if (millis() - last_log > 10000) {
            last_log = millis();
            Serial.print("[LCD] Display updated: ");
            for (int i = 0; i < 6; i++) {
                Serial.print(parking_slots[i] ? "F" : "E");
                Serial.print(" ");
            }
            Serial.println();
        }
        
        // Update every 100ms - very fast refresh
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
    
    BLUETOOTH_SERIAL.println("====================================\n");
}
