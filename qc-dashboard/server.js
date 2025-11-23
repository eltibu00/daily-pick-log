// ============================================================================
// QC DASHBOARD API SERVER
// Node.js + Express + PostgreSQL (Neon)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// DATABASE CONNECTION
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to PostgreSQL:', res.rows[0].now);
    }
});

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query(
            `SELECT u.*, t.company_name, t.subdomain
             FROM users u
             JOIN tenants t ON u.tenant_id = t.id
             WHERE u.email = $1 AND u.active = true`,
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // For demo, accept any password or check hash
        const validPassword = password === 'demo123' ||
                             await bcrypt.compare(password, user.password_hash || '');

        if (!validPassword && user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        // Generate JWT
        const token = jwt.sign(
            {
                userId: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenantId: user.tenant_id,
                companyName: user.company_name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============================================================================
// INSPECTION ROUTES
// ============================================================================

// Get all inspections (with filters)
app.get('/api/inspections', authenticateToken, async (req, res) => {
    try {
        const { status, type, client_id, assigned_to, limit = 50, offset = 0 } = req.query;
        const tenantId = req.user.tenantId;

        let query = `
            SELECT i.*,
                   c.name as client_name,
                   d.name as defect_name,
                   disp.name as disposition_name,
                   u.name as assigned_to_name,
                   cb.name as created_by_name
            FROM qc_inspections i
            LEFT JOIN clients c ON i.client_id = c.id
            LEFT JOIN defect_types d ON i.defect_type_id = d.id
            LEFT JOIN dispositions disp ON i.disposition_id = disp.id
            LEFT JOIN users u ON i.assigned_to = u.id
            LEFT JOIN users cb ON i.created_by = cb.id
            WHERE i.tenant_id = $1
        `;

        const params = [tenantId];
        let paramCount = 1;

        if (status) {
            paramCount++;
            query += ` AND i.status = $${paramCount}`;
            params.push(status);
        }

        if (type) {
            paramCount++;
            query += ` AND i.inspection_type = $${paramCount}`;
            params.push(type);
        }

        if (client_id) {
            paramCount++;
            query += ` AND i.client_id = $${paramCount}`;
            params.push(client_id);
        }

        if (assigned_to) {
            paramCount++;
            query += ` AND i.assigned_to = $${paramCount}`;
            params.push(assigned_to);
        }

        query += ` ORDER BY
            CASE WHEN i.priority = 'urgent' THEN 0 ELSE 1 END,
            i.created_at DESC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            inspections: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Get inspections error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get inspection queue grouped by status
app.get('/api/inspections/queue', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const query = `
            SELECT i.*,
                   c.name as client_name,
                   u.name as assigned_to_name
            FROM qc_inspections i
            LEFT JOIN clients c ON i.client_id = c.id
            LEFT JOIN users u ON i.assigned_to = u.id
            WHERE i.tenant_id = $1 AND i.status != 'resolved'
            ORDER BY
                CASE WHEN i.priority = 'urgent' THEN 0 ELSE 1 END,
                i.created_at ASC
        `;

        const result = await pool.query(query, [tenantId]);

        // Group by status
        const queue = {
            pending: result.rows.filter(r => r.status === 'pending'),
            in_progress: result.rows.filter(r => r.status === 'in_progress'),
            passed: result.rows.filter(r => r.status === 'passed'),
            failed: result.rows.filter(r => r.status === 'failed'),
            urgentCount: result.rows.filter(r => r.priority === 'urgent').length
        };

        res.json({ success: true, ...queue });
    } catch (error) {
        console.error('Get queue error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create new inspection
app.post('/api/inspections', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const userId = req.user.userId;
        const {
            inspection_type,
            priority = 'normal',
            client_id,
            reference_number,
            sku,
            item_description,
            lot_number,
            expiration_date,
            quantity_expected,
            location,
            notes
        } = req.body;

        // Generate inspection ID
        const idResult = await pool.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(inspection_id FROM 4) AS INTEGER)), 0) + 1 as next
             FROM qc_inspections WHERE tenant_id = $1`,
            [tenantId]
        );
        const inspectionId = 'QC-' + String(idResult.rows[0].next).padStart(5, '0');

        const result = await pool.query(
            `INSERT INTO qc_inspections (
                tenant_id, inspection_id, inspection_type, priority, client_id,
                reference_number, sku, item_description, lot_number, expiration_date,
                quantity_expected, location, notes, created_by, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
            RETURNING *`,
            [tenantId, inspectionId, inspection_type, priority, client_id,
             reference_number, sku, item_description, lot_number, expiration_date,
             quantity_expected, location, notes, userId]
        );

        res.json({
            success: true,
            inspection: result.rows[0],
            message: `Inspection ${inspectionId} created`
        });
    } catch (error) {
        console.error('Create inspection error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start inspection
app.post('/api/inspections/:id/start', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const tenantId = req.user.tenantId;

        const result = await pool.query(
            `UPDATE qc_inspections
             SET status = 'in_progress', started_at = NOW(), assigned_to = $1
             WHERE inspection_id = $2 AND tenant_id = $3
             RETURNING *`,
            [userId, id, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Inspection not found' });
        }

        res.json({ success: true, inspection: result.rows[0] });
    } catch (error) {
        console.error('Start inspection error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Complete inspection (pass/fail)
app.post('/api/inspections/:id/complete', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const tenantId = req.user.tenantId;
        const {
            quantity_inspected,
            quantity_passed,
            quantity_failed,
            defect_type_id,
            defect_notes,
            disposition_id,
            notes
        } = req.body;

        const status = quantity_failed > 0 ? 'failed' : 'passed';

        const result = await pool.query(
            `UPDATE qc_inspections
             SET status = $1, completed_at = NOW(), completed_by = $2,
                 quantity_inspected = $3, quantity_passed = $4, quantity_failed = $5,
                 defect_type_id = $6, defect_notes = $7, disposition_id = $8, notes = $9
             WHERE inspection_id = $10 AND tenant_id = $11
             RETURNING *`,
            [status, userId, quantity_inspected, quantity_passed, quantity_failed,
             defect_type_id, defect_notes, disposition_id, notes, id, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Inspection not found' });
        }

        res.json({ success: true, inspection: result.rows[0] });
    } catch (error) {
        console.error('Complete inspection error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Resolve inspection
app.post('/api/inspections/:id/resolve', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const tenantId = req.user.tenantId;

        const result = await pool.query(
            `UPDATE qc_inspections
             SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
             WHERE inspection_id = $2 AND tenant_id = $3
             RETURNING *`,
            [userId, id, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Inspection not found' });
        }

        res.json({ success: true, inspection: result.rows[0] });
    } catch (error) {
        console.error('Resolve inspection error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// DASHBOARD / METRICS ROUTES
// ============================================================================

// Get dashboard metrics
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // Get counts
        const countsQuery = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status NOT IN ('resolved')) as total_active,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'passed') as passed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE status = 'resolved' AND DATE(resolved_at) = CURRENT_DATE) as resolved_today,
                COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved')) as urgent_pending,
                AVG(resolution_time_minutes) FILTER (WHERE resolved_at IS NOT NULL AND DATE(resolved_at) = CURRENT_DATE) as avg_resolution_time
            FROM qc_inspections
            WHERE tenant_id = $1
        `, [tenantId]);

        // Get defect rate
        const defectQuery = await pool.query(`
            SELECT
                COALESCE(SUM(quantity_inspected), 0) as total_inspected,
                COALESCE(SUM(quantity_failed), 0) as total_failed
            FROM qc_inspections
            WHERE tenant_id = $1 AND DATE(completed_at) = CURRENT_DATE
        `, [tenantId]);

        const defectRate = defectQuery.rows[0].total_inspected > 0
            ? (defectQuery.rows[0].total_failed / defectQuery.rows[0].total_inspected * 100).toFixed(2)
            : 0;

        // Get by inspection type
        const byTypeQuery = await pool.query(`
            SELECT inspection_type, COUNT(*) as count
            FROM qc_inspections
            WHERE tenant_id = $1 AND status NOT IN ('resolved')
            GROUP BY inspection_type
        `, [tenantId]);

        // Get by client
        const byClientQuery = await pool.query(`
            SELECT c.name as client_name, COUNT(*) as count
            FROM qc_inspections i
            JOIN clients c ON i.client_id = c.id
            WHERE i.tenant_id = $1 AND i.status NOT IN ('resolved')
            GROUP BY c.name
            ORDER BY count DESC
            LIMIT 10
        `, [tenantId]);

        res.json({
            success: true,
            metrics: {
                ...countsQuery.rows[0],
                defect_rate: parseFloat(defectRate),
                avg_resolution_time: Math.round(countsQuery.rows[0].avg_resolution_time || 0)
            },
            byType: byTypeQuery.rows,
            byClient: byClientQuery.rows
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get inspector metrics
app.get('/api/metrics/inspector', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE DATE(completed_at) = CURRENT_DATE) as completed_today,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                AVG(resolution_time_minutes) FILTER (WHERE DATE(completed_at) = CURRENT_DATE) as avg_time_today,
                COUNT(*) FILTER (WHERE quantity_failed > 0 AND DATE(completed_at) = CURRENT_DATE) as defects_found_today
            FROM qc_inspections
            WHERE tenant_id = $1 AND (assigned_to = $2 OR completed_by = $2)
        `, [tenantId, userId]);

        res.json({
            success: true,
            metrics: result.rows[0]
        });
    } catch (error) {
        console.error('Inspector metrics error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// LOOKUP DATA ROUTES
// ============================================================================

// Get clients
app.get('/api/clients', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM clients WHERE tenant_id = $1 AND active = true ORDER BY name',
            [req.user.tenantId]
        );
        res.json({ success: true, clients: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get defect types
app.get('/api/defect-types', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM defect_types WHERE tenant_id = $1 AND active = true ORDER BY category, name',
            [req.user.tenantId]
        );
        res.json({ success: true, defectTypes: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get dispositions
app.get('/api/dispositions', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM dispositions WHERE tenant_id = $1 AND active = true ORDER BY name',
            [req.user.tenantId]
        );
        res.json({ success: true, dispositions: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get inspectors (users with inspector/manager role)
app.get('/api/inspectors', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role FROM users
             WHERE tenant_id = $1 AND active = true AND role IN ('inspector', 'manager', 'admin')
             ORDER BY name`,
            [req.user.tenantId]
        );
        res.json({ success: true, inspectors: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// REPORTS ROUTES
// ============================================================================

// Client defect report
app.get('/api/reports/client-defects', authenticateToken, async (req, res) => {
    try {
        const { client_id, start_date, end_date } = req.query;
        const tenantId = req.user.tenantId;

        let query = `
            SELECT
                c.name as client_name,
                COUNT(*) as total_inspections,
                SUM(quantity_inspected) as total_units,
                SUM(quantity_passed) as units_passed,
                SUM(quantity_failed) as units_failed,
                ROUND(AVG(resolution_time_minutes)::numeric, 1) as avg_resolution_time,
                ROUND((SUM(quantity_failed)::numeric / NULLIF(SUM(quantity_inspected), 0) * 100), 2) as defect_rate
            FROM qc_inspections i
            JOIN clients c ON i.client_id = c.id
            WHERE i.tenant_id = $1 AND i.status = 'resolved'
        `;

        const params = [tenantId];
        let paramCount = 1;

        if (client_id) {
            paramCount++;
            query += ` AND i.client_id = $${paramCount}`;
            params.push(client_id);
        }

        if (start_date) {
            paramCount++;
            query += ` AND i.created_at >= $${paramCount}`;
            params.push(start_date);
        }

        if (end_date) {
            paramCount++;
            query += ` AND i.created_at <= $${paramCount}`;
            params.push(end_date);
        }

        query += ' GROUP BY c.name ORDER BY total_inspections DESC';

        const result = await pool.query(query, params);

        res.json({ success: true, report: result.rows });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
    console.log(`QC Dashboard API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
