/*
 * Vehicle Routes - Handles vehicle entry and exit operations
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../database/db_mysql');

const PARKING_FEE_PER_HOUR = 50000;  // 50,000 VND per hour

// =====================================================
// POST /api/vehicle/enter - Vehicle Entry
// =====================================================

router.post('/enter', async (req, res) => {
    try {
        const { rfid_uid, timestamp, parking_slots } = req.body;
        
        console.log(`[VEHICLE] Entry request - RFID: ${rfid_uid}`);
        
        // Validate input
        if (!rfid_uid) {
            return res.status(400).json({ error: 'RFID UID is required' });
        }
        
        const vehicle_id = uuidv4();
        const entry_time = timestamp ? new Date(timestamp) : new Date();
        
        // Check if vehicle already inside (to prevent duplicate entries)
        const existing_vehicle = await db.get(
            'SELECT vehicle_id FROM vehicles_log WHERE rfid_uid = ? AND exit_time IS NULL',
            [rfid_uid]
        );
        
        if (existing_vehicle) {
            return res.status(409).json({ 
                error: 'Vehicle already inside the parking',
                vehicle_id: existing_vehicle.vehicle_id
            });
        }
        
        // Get user information
        const user = await db.get(
            'SELECT user_id, full_name, account_balance FROM users WHERE rfid_uid = ?',
            [rfid_uid]
        );
        
        const user_id = user ? user.user_id : null;
        
        // Insert vehicle entry record
        await db.insert(
            `INSERT INTO vehicles_log (vehicle_id, rfid_uid, user_id, entry_time, entry_gate, gate_status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [vehicle_id, rfid_uid, user_id, entry_time, 'main', 'completed']
        );
        
        // Update parking slot status if provided
        if (parking_slots && parking_slots.length > 0) {
            await updateParkingSlots(parking_slots);
        }
        
        console.log(`[VEHICLE] Entry recorded - ID: ${vehicle_id}`);
        
        res.status(201).json({
            vehicle_id,
            rfid_uid,
            user_id,
            user_name: user ? user.full_name : 'Unknown',
            entry_time,
            status: 'Entry recorded',
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Vehicle entry error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// POST /api/vehicle/exit - Vehicle Exit & Payment
// =====================================================

router.post('/exit', async (req, res) => {
    try {
        const { rfid_uid, timestamp, parking_slots } = req.body;
        
        console.log(`[VEHICLE] Exit request - RFID: ${rfid_uid}`);
        
        if (!rfid_uid) {
            return res.status(400).json({ error: 'RFID UID is required' });
        }
        
        const exit_time = timestamp ? new Date(timestamp) : new Date();
        
        // Find the entry record
        const vehicle = await db.get(
            `SELECT * FROM vehicles_log WHERE rfid_uid = ? AND exit_time IS NULL 
             ORDER BY entry_time DESC LIMIT 1`,
            [rfid_uid]
        );
        
        if (!vehicle) {
            return res.status(404).json({ error: 'No active vehicle entry found' });
        }
        
        // Calculate parking duration and fees
        const entry = new Date(vehicle.entry_time);
        const duration_ms = exit_time - entry;
        const duration_hours = Math.ceil(duration_ms / (1000 * 60 * 60));
        const duration_minutes = Math.round(duration_ms / (1000 * 60));
        
        // Calculate payment (VND)
        const payment_amount = duration_hours * PARKING_FEE_PER_HOUR;
        
        // Process payment
        const { payment_status, transaction_id } = await processPayment(
            vehicle.vehicle_id,
            vehicle.user_id,
            rfid_uid,
            payment_amount
        );
        
        // Update vehicle exit record
        await db.update(
            `UPDATE vehicles_log 
             SET exit_time = ?, duration_minutes = ?, payment_amount = ?, 
                 payment_status = ?, exit_gate = ?
             WHERE vehicle_id = ?`,
            [exit_time, duration_minutes, payment_amount, payment_status, 'main', vehicle.vehicle_id]
        );
        
        // Update parking slot status
        if (parking_slots && parking_slots.length > 0) {
            await updateParkingSlots(parking_slots);
        }
        
        console.log(`[VEHICLE] Exit processed - ID: ${vehicle.vehicle_id}`);
        
        res.status(200).json({
            vehicle_id: vehicle.vehicle_id,
            rfid_uid,
            entry_time: vehicle.entry_time,
            exit_time,
            duration_minutes,
            duration_hours,
            payment_amount,
            payment_status,
            transaction_id,
            message: `Payment ${payment_status}`,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Vehicle exit error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/vehicle/:rfid_uid - Get vehicle details
// =====================================================

router.get('/:rfid_uid', async (req, res) => {
    try {
        const { rfid_uid } = req.params;
        
        const vehicle = await db.get(
            `SELECT * FROM vehicles_log 
             WHERE rfid_uid = ? 
             ORDER BY entry_time DESC LIMIT 1`,
            [rfid_uid]
        );
        
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        res.json({
            vehicle,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get vehicle error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/vehicle/history/:user_id - Get user's vehicle history
// =====================================================

router.get('/history/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const days = parseInt(req.query.days) || 30;
        
        const since = moment().subtract(days, 'days').format('YYYY-MM-DD');
        
        const vehicles = await db.all(
            `SELECT * FROM vehicles_log 
             WHERE user_id = ? AND DATE(entry_time) >= ? 
             ORDER BY entry_time DESC`,
            [user_id, since]
        );
        
        // Calculate statistics
        let total_visits = vehicles.length;
        let total_spent = 0;
        
        vehicles.forEach(v => {
            if (v.payment_status === 'completed') {
                total_spent += v.payment_amount || 0;
            }
        });
        
        res.json({
            user_id,
            days,
            total_visits,
            total_spent,
            vehicles,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function processPayment(vehicle_id, user_id, rfid_uid, amount) {
    console.log(`[PAYMENT] Processing ${amount} VND for vehicle ${vehicle_id}`);
    
    // Transaction ID
    const transaction_id = uuidv4();
    
    if (!user_id) {
        // Unknown user - mark as pending
        return { payment_status: 'pending', transaction_id };
    }
    
    try {
        // Check if user has sufficient balance
        const user = await db.get(
            'SELECT account_balance FROM users WHERE user_id = ?',
            [user_id]
        );
        
        if (user && user.account_balance >= amount) {
            // Deduct from account balance
            await db.update(
                'UPDATE users SET account_balance = account_balance - ? WHERE user_id = ?',
                [amount, user_id]
            );
            
            // Record transaction
            await recordTransaction(transaction_id, user_id, vehicle_id, amount, 'completed');
            console.log(`[PAYMENT] Completed - Balance deducted ${amount} VND`);
            return { payment_status: 'completed', transaction_id };
        } else {
            // Insufficient balance
            console.log(`[PAYMENT] Insufficient balance - Required: ${amount} VND`);
            await recordTransaction(transaction_id, user_id, vehicle_id, amount, 'failed');
            return { payment_status: 'failed', transaction_id };
        }
    } catch (error) {
        console.error('[ERROR] Payment processing error:', error);
        return { payment_status: 'failed', transaction_id };
    }
}

async function recordTransaction(transaction_id, user_id, vehicle_id, amount, status) {
    try {
        await db.insert(
            `INSERT INTO transaction_history 
             (transaction_id, user_id, vehicle_id, transaction_type, amount, transaction_status, payment_method)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [transaction_id, user_id, vehicle_id, 'parking_fee', amount, status, 'account_balance']
        );
    } catch (error) {
        console.error('[ERROR] Transaction record error:', error);
    }
}

async function updateParkingSlots(slots) {
    // Update parking slot occupancy status
    try {
        for (let i = 0; i < slots.length && i < 6; i++) {
            const is_occupied = slots[i];
            const slot_id = i + 1;
            
            await db.update(
                'UPDATE parking_slots SET is_occupied = ?, updated_at = ? WHERE slot_id = ?',
                [is_occupied ? 1 : 0, new Date(), slot_id]
            );
            console.log(`[SLOTS] Updated slot ${slot_id} - is_occupied: ${is_occupied}`);
        }
    } catch (error) {
        console.error(`[ERROR] Parking slot update error:`, error);
    }
}

module.exports = router;
