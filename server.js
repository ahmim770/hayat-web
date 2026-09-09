const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

function readEnv(name, { required = true, defaultValue, allowEmpty = false } = {}) {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : raw;
  const hasValue = value !== undefined && (allowEmpty ? true : value !== '');
  if (!hasValue) {
    if (defaultValue !== undefined) return defaultValue;
    if (required) throw new Error(`Missing environment variable: ${name}`);
    return undefined;
  }
  return value;
}

function maskSecret(value) {
  if (!value) return 'missing';
  return `set(len=${String(value).length})`;
}

const PORT = Number(readEnv('PORT', { required: false, defaultValue: '3000' }));
const JWT_SECRET = readEnv('JWT_SECRET');

const DB_HOST = readEnv('DB_HOST');
const DB_PORT = Number(readEnv('DB_PORT', { required: false, defaultValue: '3306' }));
const DB_USER = readEnv('DB_USER');
const DB_PASSWORD = readEnv('DB_PASSWORD', { allowEmpty: true });
const DB_NAME = readEnv('DB_NAME');

console.log('ENV loaded:', {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_NAME,
  PORT,
  DB_PASSWORD: maskSecret(DB_PASSWORD),
  JWT_SECRET: maskSecret(JWT_SECRET)
});

const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const dbPool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = dbPool.promise();

function getTokenFromRequest(req) {
  const header = req.header('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return req.cookies.token || null;
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token');
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    user_id: u.user_id,
    username: u.username,
    email: u.email,
    role: u.role
  };
}

async function authOptional(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, role: payload.role };
    return next();
  } catch {
    req.user = null;
    return next();
  }
}

function authRequired(req, res, next) {
  authOptional(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    return next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ ok: true });
  } catch (err) {
    console.error('Health check DB error:', err.message);
    return res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

app.get('/api/auth/me', authOptional, async (req, res) => {
  if (!req.user) return res.json({ user: null });

  try {
    const [rows] = await db.query(
      'SELECT user_id, username, email, role FROM users WHERE user_id = ?',
      [req.user.userId]
    );

    return res.json({ user: rows[0] ? sanitizeUser(rows[0]) : null });
  } catch (err) {
    console.error('Fetch user error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const isEmail = identifier.includes('@');

    const [rows] = await db.query(
      `SELECT user_id, username, password, email, role
       FROM users
       WHERE ${isEmail ? 'email' : 'username'} = ?
       LIMIT 1`,
      [identifier]
    );

    const user = rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const stored = String(user.password || '');
    let ok = false;

    if (
      stored.startsWith('$2a$') ||
      stored.startsWith('$2b$') ||
      stored.startsWith('$2y$')
    ) {
      ok = await bcrypt.compare(password, stored);
    } else {
      ok = password === stored;
    }

    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

app.get('/api/hospitals', async (req, res) => {
  const search = String(req.query.search || '').trim();

  try {
    if (search) {
      const [rows] = await db.query(
        `SELECT hospital_id, name, address, phone, email
         FROM hospitals
         WHERE name LIKE ? OR address LIKE ?
         ORDER BY name`,
        [`%${search}%`, `%${search}%`]
      );

      return res.json(rows);
    }

    const [rows] = await db.query(
      `SELECT hospital_id, name, address, phone, email
       FROM hospitals
       ORDER BY name`
    );

    return res.json(rows);
  } catch (err) {
    console.error('Hospitals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

app.get('/api/doctors/specializations', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT specialization
       FROM doctors
       ORDER BY specialization`
    );

    return res.json(rows.map(r => r.specialization));
  } catch (err) {
    console.error('Specializations error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch specializations' });
  }
});

app.get('/api/doctors', async (req, res) => {
  const specialization = String(req.query.specialization || '').trim();
  const hospitalId = String(req.query.hospital_id || '').trim();
  const search = String(req.query.search || '').trim();

  const where = [];
  const params = [];

  if (specialization) {
    where.push('d.specialization = ?');
    params.push(specialization);
  }

  if (hospitalId) {
    where.push('d.hospital_id = ?');
    params.push(Number(hospitalId));
  }

  if (search) {
    where.push('(d.full_name LIKE ? OR d.specialization LIKE ? OR h.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const [rows] = await db.query(
      `SELECT d.doctor_id, d.hospital_id, d.full_name, d.specialization, d.phone,
              h.name AS hospital_name
       FROM doctors d
       JOIN hospitals h ON h.hospital_id = d.hospital_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY d.full_name`,
      params
    );

    return res.json(rows);
  } catch (err) {
    console.error('Doctors error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

async function getPatientIdForUser(userId) {
  const [rows] = await db.query(
    'SELECT patient_id FROM patients WHERE user_id = ? LIMIT 1',
    [userId]
  );

  return rows[0]?.patient_id || null;
}

app.get('/api/patients/me', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.patient_id, p.full_name, p.date_of_birth, p.gender, p.phone,
              u.email, u.username, u.user_id
       FROM patients p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.user_id = ?
       LIMIT 1`,
      [req.user.userId]
    );

    const me = rows[0];

    if (!me) return res.status(404).json({ error: 'Patient profile not found' });

    return res.json(me);
  } catch (err) {
    console.error('Patient profile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/appointments/my', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const patientId = await getPatientIdForUser(req.user.userId);

    if (!patientId) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const [rows] = await db.query(
      `SELECT a.appointment_id, a.appointment_date, a.status, a.notes,
              d.doctor_id, d.full_name AS doctor_name, d.specialization,
              h.hospital_id, h.name AS hospital_name
       FROM appointments a
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN hospitals h ON h.hospital_id = a.hospital_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC`,
      [patientId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Appointments error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

function csvEscape(value) {
  const s = String(value ?? '');

  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

app.get('/api/appointments/my.csv', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const patientId = await getPatientIdForUser(req.user.userId);

    if (!patientId) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const [rows] = await db.query(
      `SELECT a.appointment_id, a.appointment_date, a.status,
              d.full_name AS doctor_name, d.specialization,
              h.name AS hospital_name
       FROM appointments a
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN hospitals h ON h.hospital_id = a.hospital_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC`,
      [patientId]
    );

    const header = [
      'appointment_id',
      'appointment_date',
      'status',
      'doctor_name',
      'specialization',
      'hospital_name'
    ];

    const lines = [header.join(',')];

    for (const row of rows) {
      lines.push(header.map(k => csvEscape(row[k])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="appointments.csv"');

    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('CSV export error:', err.message);
    return res.status(500).json({ error: 'Failed to export appointments' });
  }
});

app.post('/api/appointments', authRequired, requireRole('patient'), async (req, res) => {
  const doctorId = Number(req.body.doctor_id);
  const hospitalId = Number(req.body.hospital_id);
  const appointmentDate = String(req.body.appointment_date || '').trim();
  const notes = String(req.body.notes || '').trim() || null;

  if (!doctorId || !hospitalId || !appointmentDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const patientId = await getPatientIdForUser(req.user.userId);

    if (!patientId) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const [doctorRows] = await db.query(
      'SELECT doctor_id, hospital_id FROM doctors WHERE doctor_id = ? LIMIT 1',
      [doctorId]
    );

    const doctor = doctorRows[0];

    if (!doctor) return res.status(400).json({ error: 'Invalid doctor' });

    if (Number(doctor.hospital_id) !== hospitalId) {
      return res.status(400).json({ error: 'Doctor not in hospital' });
    }

    const [result] = await db.query(
      `INSERT INTO appointments 
       (patient_id, doctor_id, hospital_id, appointment_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [patientId, doctorId, hospitalId, appointmentDate, notes]
    );

    return res.status(201).json({ appointment_id: result.insertId });
  } catch (err) {
    console.error('Create appointment error:', err.message);
    return res.status(500).json({ error: 'Failed to create appointment' });
  }
});

app.put('/api/appointments/:id', authRequired, requireRole('patient'), async (req, res) => {
  const appointmentId = Number(req.params.id);
  const status = String(req.body.status || '').trim();

  const allowed = new Set(['Scheduled', 'Completed', 'Cancelled']);

  if (!appointmentId) {
    return res.status(400).json({ error: 'Invalid appointment id' });
  }

  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const patientId = await getPatientIdForUser(req.user.userId);

    if (!patientId) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const [rows] = await db.query(
      'SELECT appointment_id FROM appointments WHERE appointment_id = ? AND patient_id = ? LIMIT 1',
      [appointmentId, patientId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    await db.query(
      'UPDATE appointments SET status = ? WHERE appointment_id = ?',
      [status, appointmentId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Update appointment error:', err.message);
    return res.status(500).json({ error: 'Failed to update appointment' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error('DB CONNECTION ERROR:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
