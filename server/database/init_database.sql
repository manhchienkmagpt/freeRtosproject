-- =====================================================
-- SMART PARKING SYSTEM DATABASE SCHEMA (REDESIGNED)
-- =====================================================
-- MySQL Database Initialization Script
-- Bluetooth-Only Servo Control Version
-- 
-- Changes from RFID version:
-- - REMOVED: users, rfid_cards, vehicles_log, transaction_history tables
-- - ADDED: servo_events, servo_status tables
-- - KEPT: alarm_logs, parking_slots (for future expansion)

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS parking_system;

-- Use the database
USE parking_system;

-- Enable foreign keys
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- SERVO EVENTS TABLE (NEW - CORE)
-- =====================================================
-- Logs all servo open/close events triggered via Bluetooth

CREATE TABLE IF NOT EXISTS servo_events (
    event_id VARCHAR(36) PRIMARY KEY,
    gate_type VARCHAR(20) NOT NULL,        -- 'GATE_IN' or 'GATE_OUT'
    action VARCHAR(10) NOT NULL,           -- 'OPEN' or 'CLOSE'
    status VARCHAR(20) DEFAULT 'SUCCESS',  -- 'SUCCESS' or 'FAILED'
    servo_angle INT,                       -- 0-180 degrees
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_servo_events_gate_type (gate_type),
    INDEX idx_servo_events_timestamp (timestamp),
    INDEX idx_servo_events_action (action)
);

-- =====================================================
-- SERVO STATUS TABLE (NEW - STATE TRACKING)
-- =====================================================
-- Tracks current state and statistics of each servo gate

CREATE TABLE IF NOT EXISTS servo_status (
    gate_id INT PRIMARY KEY AUTO_INCREMENT,
    gate_type VARCHAR(20) UNIQUE NOT NULL,      -- 'GATE_IN' or 'GATE_OUT'
    current_position INT DEFAULT 0,             -- 0-180 degrees (0=closed, 90=open)
    is_open INT DEFAULT 0,                      -- 0=closed, 1=open
    last_action VARCHAR(10),                    -- 'OPEN' or 'CLOSE'
    last_action_time TIMESTAMP,
    total_operations INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Initialize servo status for both gates
INSERT IGNORE INTO servo_status (gate_id, gate_type, current_position, is_open)
VALUES 
    (1, 'GATE_IN', 0, 0),
    (2, 'GATE_OUT', 0, 0);

-- =====================================================
-- ALARM LOGS TABLE (KEPT FOR FUTURE)
-- =====================================================
-- Logs smoke, flame, and other security alerts

CREATE TABLE IF NOT EXISTS alarm_logs (
    alarm_id VARCHAR(36) PRIMARY KEY,
    alarm_type VARCHAR(20) NOT NULL,          -- 'smoke', 'flame', 'intrusion'
    sensor_type VARCHAR(50),                  -- 'MQ2', 'flame_sensor', etc
    sensor_value INT,
    alarm_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved INT DEFAULT 0,                   -- 0=unresolved, 1=resolved
    resolved_time TIMESTAMP,
    resolved_by VARCHAR(100),
    severity VARCHAR(20) DEFAULT 'high',      -- 'low', 'medium', 'high', 'critical'
    action_taken TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alarm_logs_type (alarm_type),
    INDEX idx_alarm_logs_time (alarm_time),
    INDEX idx_alarm_logs_resolved (resolved)
);

-- =====================================================
-- PARKING SLOTS TABLE (KEPT FOR FUTURE EXPANSION)
-- =====================================================
-- Optional: for future occupancy detection

CREATE TABLE IF NOT EXISTS parking_slots (
    slot_id INT PRIMARY KEY,
    slot_name VARCHAR(50) UNIQUE NOT NULL,
    slot_level VARCHAR(20) DEFAULT 'ground',  -- 'ground', 'level_1', 'level_2'
    is_occupied INT DEFAULT 0,                -- 0=empty, 1=occupied
    entry_time TIMESTAMP,
    sensor_value INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_parking_occupied (is_occupied)
);

-- Initialize parking slots
INSERT IGNORE INTO parking_slots (slot_id, slot_name, slot_level, is_occupied)
VALUES 
    (1, 'Slot-1', 'ground', 0),
    (2, 'Slot-2', 'ground', 0),
    (3, 'Slot-3', 'ground', 0),
    (4, 'Slot-4', 'ground', 0),
    (5, 'Slot-5', 'ground', 0),
    (6, 'Slot-6', 'ground', 0);

-- =====================================================
-- SYSTEM LOGS TABLE (OPTIONAL)
-- =====================================================
-- For debugging and monitoring

CREATE TABLE IF NOT EXISTS system_logs (
    log_id VARCHAR(36) PRIMARY KEY,
    log_level VARCHAR(20),              -- 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
    log_message TEXT,
    source VARCHAR(50),                 -- 'Arduino', 'ESP32', 'Server'
    log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    additional_data TEXT,
    INDEX idx_system_logs_time (log_time),
    INDEX idx_system_logs_level (log_level)
);

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- Daily servo activity view
CREATE OR REPLACE VIEW daily_servo_activity AS
SELECT 
    DATE(timestamp) as date,
    gate_type,
    action,
    COUNT(*) as count,
    MIN(timestamp) as first_action,
    MAX(timestamp) as last_action
FROM servo_events
GROUP BY DATE(timestamp), gate_type, action;

-- Gate statistics view
CREATE OR REPLACE VIEW gate_statistics AS
SELECT 
    gate_type,
    is_open,
    total_operations,
    last_action,
    last_action_time,
    updated_at
FROM servo_status;

-- Hourly servo activity view
CREATE OR REPLACE VIEW hourly_servo_activity AS
SELECT 
    DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as hour,
    gate_type,
    action,
    COUNT(*) as count
FROM servo_events
GROUP BY DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00'), gate_type, action
ORDER BY hour DESC;

-- =====================================================
-- END OF DATABASE INITIALIZATION
-- Created: 2024-01-20
-- Version: Bluetooth-Only System v1.0
-- Status: Ready for use
-- ===================================================
