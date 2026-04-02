/*
 * Alarm Routes - Handles fire/smoke alarm alerts
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../database/db');

// =====================================================
// POST /api/alarm - Log alarm alert
// =====================================================

router.post('/', (req, res) => {
    const { alarm_type, sensor_value, timestamp } = req.body;
    
    console.log(`[ALARM] Alert received - Type: ${alarm_type}, Value: ${sensor_value}`);
    
    if (!alarm_type) {
        return res.status(400).json({ error: 'Alarm type is required' });
    }
    
    const alarm_id = uuidv4();
    const alarm_time = timestamp ? new Date(timestamp) : new Date();
    
    // Map alarm types
    const sensor_type = alarm_type === 'smoke' ? 'MQ2_SMOKE' : 'FLAME_SENSOR';
    const severity = getSeverity(alarm_type, sensor_value);
    
    // Insert alarm log
    db.run(
        `INSERT INTO alarm_logs 
         (alarm_id, alarm_type, sensor_type, sensor_value, alarm_time, severity)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [alarm_id, alarm_type, sensor_type, sensor_value || null, alarm_time, severity],
        (err) => {
            if (err) {
                console.error('[ERROR] Alarm insert error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Log system event
            logSystemEvent('ALARM', `${alarm_type.toUpperCase()} detected - Value: ${sensor_value}`);
            
            // Send emergency notifications (could integrate SMS/Email here)
            handleAlarmNotification(alarm_id, alarm_type, sensor_value);
            
            console.log(`[ALARM] Logged - ID: ${alarm_id}`);
            
            res.status(201).json({
                alarm_id,
                alarm_type,
                sensor_value,
                severity,
                status: 'Alert received and logged',
                timestamp: alarm_time
            });
        }
    );
});

// =====================================================
// GET /api/alarm/active - Get active/unresolved alarms
// =====================================================

router.get('/active', (req, res) => {
    db.all(
        `SELECT * FROM alarm_logs 
         WHERE resolved = 0 
         ORDER BY alarm_time DESC`,
        (err, alarms) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                active_alarms: alarms.length,
                alarms,
                timestamp: new Date()
            });
        }
    );
});

// =====================================================
// GET /api/alarm/recent - Get recent alarms
// =====================================================

router.get('/recent', (req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    const since = moment().subtract(hours, 'hours').format('YYYY-MM-DD HH:mm:ss');
    
    db.all(
        `SELECT * FROM alarm_logs 
         WHERE alarm_time >= ?
         ORDER BY alarm_time DESC
         LIMIT 100`,
        [since],
        (err, alarms) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const stats = {
                total: alarms.length,
                smoke_alarms: alarms.filter(a => a.alarm_type === 'smoke').length,
                flame_alarms: alarms.filter(a => a.alarm_type === 'flame').length,
                resolved: alarms.filter(a => a.resolved).length,
                unresolved: alarms.filter(a => !a.resolved).length
            };
            
            res.json({
                period_hours: hours,
                statistics: stats,
                alarms,
                timestamp: new Date()
            });
        }
    );
});

// =====================================================
// GET /api/alarm/daily-summary - Daily alarm summary
// =====================================================

router.get('/daily-summary', (req, res) => {
    const date = req.query.date || moment().format('YYYY-MM-DD');
    
    db.all(
        `SELECT 
            alarm_type,
            severity,
            COUNT(*) as count
         FROM alarm_logs
         WHERE DATE(alarm_time) = ?
         GROUP BY alarm_type, severity
         ORDER BY severity DESC`,
        [date],
        (err, summary) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            db.all(
                `SELECT * FROM alarm_logs
                 WHERE DATE(alarm_time) = ?
                 ORDER BY alarm_time DESC`,
                [date],
                (err, alarms) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    res.json({
                        date,
                        total_alarms: alarms.length,
                        summary,
                        alarms,
                        timestamp: new Date()
                    });
                }
            );
        }
    );
});

// =====================================================
// PUT /api/alarm/:alarm_id/resolve - Resolve alarm
// =====================================================

router.put('/:alarm_id/resolve', (req, res) => {
    const { alarm_id } = req.params;
    const { action_taken, notes, resolved_by } = req.body;
    
    console.log(`[ALARM] Resolving alarm: ${alarm_id}`);
    
    db.run(
        `UPDATE alarm_logs 
         SET resolved = 1, resolved_time = ?, action_taken = ?, notes = ?, resolved_by = ?
         WHERE alarm_id = ?`,
        [new Date(), action_taken || 'Manual resolve', notes || '', resolved_by || 'System', alarm_id],
        (err) => {
            if (err) {
                console.error('[ERROR] Alarm resolve error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            logSystemEvent('ALARM_RESOLVE', `Alarm ${alarm_id} resolved by ${resolved_by}`);
            
            res.json({
                alarm_id,
                status: 'Resolved',
                resolved_at: new Date()
            });
        }
    );
});

// =====================================================
// DELETE /api/alarm/:alarm_id - Delete alarm record
// =====================================================

router.delete('/:alarm_id', (req, res) => {
    const { alarm_id } = req.params;
    
    console.log(`[ALARM] Deleting alarm: ${alarm_id}`);
    
    db.run(
        'DELETE FROM alarm_logs WHERE alarm_id = ?',
        [alarm_id],
        (err) => {
            if (err) {
                console.error('[ERROR] Alarm delete error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                alarm_id,
                status: 'Deleted'
            });
        }
    );
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getSeverity(alarm_type, sensor_value) {
    // Determine alarm severity based on type and sensor value
    if (alarm_type === 'smoke') {
        if (sensor_value > 600) return 'critical';
        if (sensor_value > 500) return 'high';
        if (sensor_value > 400) return 'medium';
        return 'low';
    } else if (alarm_type === 'flame') {
        return 'critical';  // Flame detection is always critical
    }
    return 'medium';
}

function handleAlarmNotification(alarm_id, alarm_type, sensor_value) {
    // In production, this would send:
    // - SMS alerts to administrator
    // - Email notifications
    // - Sound/Visual alerts
    
    console.log(`[NOTIFICATION] Alarm notification triggered for ${alarm_id}`);
    
    // Example: Log to system
    logSystemEvent('NOTIFICATION', 
        `Alert sent for ${alarm_type} alarm (${alarm_id})`);
    
    // Could integrate with external services:
    // - Twilio for SMS
    // - SendGrid for Email
    // - Push notifications to mobile app
}

function logSystemEvent(event_type, message) {
    const log_id = uuidv4();
    
    db.run(
        `INSERT INTO system_logs (log_id, log_level, log_message, source, additional_data)
         VALUES (?, ?, ?, ?, ?)`,
        [log_id, 'INFO', message, 'Alarm System', event_type],
        (err) => {
            if (err) {
                console.error('[ERROR] System log error:', err);
            }
        }
    );
}

// =====================================================
// ALARM STATISTICS
// =====================================================

router.get('/stats/monthly', (req, res) => {
    const month = req.query.month || moment().format('YYYY-MM');
    
    db.all(
        `SELECT 
            DATE(alarm_time) as date,
            COUNT(*) as count,
            SUM(CASE WHEN alarm_type = 'smoke' THEN 1 ELSE 0 END) as smoke_count,
            SUM(CASE WHEN alarm_type = 'flame' THEN 1 ELSE 0 END) as flame_count
         FROM alarm_logs
         WHERE strftime('%Y-%m', alarm_time) = ?
         GROUP BY DATE(alarm_time)
         ORDER BY date DESC`,
        [month],
        (err, stats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            const total = stats.reduce((sum, s) => sum + s.count, 0);
            
            res.json({
                month,
                total_alarms: total,
                daily_breakdown: stats,
                timestamp: new Date()
            });
        }
    );
});

module.exports = router;
