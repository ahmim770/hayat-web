const express = require('express');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected...');
});

// SELECT
app.get('/api/appointments', (req, res) => {
  db.query('SELECT * FROM appointments', (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

// INSERT
app.post('/api/appointments', (req, res) => {
  const { patient_id, doctor_id, hospital_id, appointment_date } = req.body;
  const sql = 'INSERT INTO appointments (patient_id, doctor_id, hospital_id, appointment_date) VALUES (?, ?, ?, ?)';
  db.query(sql, [patient_id, doctor_id, hospital_id, appointment_date], (err, result) => {
    if (err) throw err;
    res.json({ message: 'Appointment added' });
  });
});

// UPDATE
app.put('/api/appointments/:id', (req, res) => {
  const { status } = req.body;
  const sql = 'UPDATE appointments SET status = ? WHERE appointment_id = ?';
  db.query(sql, [status, req.params.id], (err, result) => {
    if (err) throw err;
    res.json({ message: 'Appointment updated' });
  });
});

// DELETE
app.delete('/api/appointments/:id', (req, res) => {
  const sql = 'DELETE FROM appointments WHERE appointment_id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err) throw err;
    res.json({ message: 'Appointment deleted' });
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
