CREATE DATABASE hayat;
USE hayat;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    role ENUM('patient', 'doctor', 'admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hospitals (
    hospital_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100)
);

CREATE TABLE patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('Male', 'Female', 'Other') NOT NULL,
    phone VARCHAR(20),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE doctors (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id INT NOT NULL,
    user_id INT UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    hospital_id INT NOT NULL,
    appointment_date DATETIME NOT NULL,
    status ENUM('Scheduled', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    notes TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
);

INSERT INTO users (username, password, email, role) VALUES
('ahmed_pat', 'pass123', 'ahmed@email.com', 'patient'),
('sara_pat', 'pass123', 'sara@email.com', 'patient'),
('dr_zaki', 'pass123', 'zaki@hayat.com', 'doctor'),
('dr_leila', 'pass123', 'leila@hayat.com', 'doctor'),
('admin_hayat', 'admin789', 'admin@hayat.com', 'admin');

INSERT INTO hospitals (name, address, phone, email) VALUES
('City General Hospital', '123 Main St, Cairo', '01011112222', 'info@citygen.com'),
('Hope Medical Center', '45 Hope Rd, Giza', '01122223333', 'contact@hopemed.com'),
('Sunrise Specialty Clinic', '78 Sunrise Ave, Alexandria', '01233334444', 'admin@sunrise.com'),
('Al-Noor Hospital', '12 Al-Noor Sq, Mansoura', '01544445555', 'help@alnoor.com'),
('Elite Health Institute', '90 Elite Towers, Maadi', '01055556666', 'office@elitehealth.com');

INSERT INTO patients (user_id, full_name, date_of_birth, gender, phone) VALUES
(1, 'Ahmed Ali', '1990-05-15', 'Male', '01000000001'),
(2, 'Sara Hassan', '1995-10-20', 'Female', '01000000002'),
(NULL, 'Omar Khalid', '1985-02-28', 'Male', '01000000003'),
(NULL, 'Mona Yassin', '1992-12-12', 'Female', '01000000004'),
(NULL, 'Youssef Mansour', '2000-07-07', 'Male', '01000000005');

INSERT INTO doctors (hospital_id, user_id, full_name, specialization, phone) VALUES
(1, 3, 'Dr. Zaki Ibrahim', 'Cardiology', '01100000001'),
(1, 4, 'Dr. Leila Farid', 'Pediatrics', '01100000002'),
(2, NULL, 'Dr. Hassan Amin', 'Orthopedics', '01100000003'),
(3, NULL, 'Dr. Nadia Roushdy', 'Dermatology', '01100000004'),
(4, NULL, 'Dr. Tarek Hegazi', 'Neurology', '01100000005');

INSERT INTO appointments (patient_id, doctor_id, hospital_id, appointment_date, status) VALUES
(1, 1, 1, '2026-05-01 10:00:00', 'Scheduled'),
(2, 2, 1, '2026-05-02 11:30:00', 'Scheduled'),
(3, 3, 2, '2026-05-03 14:00:00', 'Scheduled'),
(4, 4, 3, '2026-05-04 09:00:00', 'Completed'),
(5, 5, 4, '2026-05-05 16:45:00', 'Cancelled');