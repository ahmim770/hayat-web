async function apiFetch(path, options) {
  const opts = options ? { ...options } : {};
  opts.credentials = 'include';
  opts.headers = opts.headers ? { ...opts.headers } : {};
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' && data && data.error ? data.error : 'Request failed';
    throw new Error(msg);
  }
  return data;
}

function qs(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function formatDateTime(dtString) {
  const d = new Date(dtString);
  if (Number.isNaN(d.getTime())) return dtString;
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function showInlineError(container, message) {
  if (!container) return;
  container.textContent = message;
  container.classList.remove('d-none');
}

function hideInlineError(container) {
  if (!container) return;
  container.textContent = '';
  container.classList.add('d-none');
}

async function getCurrentUser() {
  const data = await apiFetch('/api/auth/me', { method: 'GET' });
  return data.user;
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

function wireLogoutLinks(user) {
  const loginLinks = Array.from(document.querySelectorAll('a[href="login.html"]'));
  for (const link of loginLinks) {
    if (!user) continue;
    link.textContent = 'Logout';
    link.classList.add('btn', 'btn-outline-primary', 'px-4', 'py-2');
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await logout();
      } finally {
        window.location.href = 'login.html';
      }
    });
  }
}

async function initHospitals() {
  const grid = document.getElementById('hospitalGrid');
  const search = document.getElementById('hospitalSearch');
  if (!grid) return;

  const render = (hospitals) => {
    grid.innerHTML = '';
    for (const h of hospitals) {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-lg-4 fade-in';
      col.innerHTML = `
        <div class="card h-100 p-3">
          <div class="hospital-img-placeholder mb-3">
            <i class="bi bi-hospital"></i>
          </div>
          <div class="card-body p-0 d-flex flex-column">
            <h5 class="card-title fw-bold"></h5>
            <p class="card-text text-muted small mb-4">
              <i class="bi bi-geo-alt me-1"></i> <span class="hospital-address"></span>
            </p>
            <a class="btn btn-primary w-100 mt-auto" href="doctors.html?hospital_id=${encodeURIComponent(
              h.hospital_id
            )}">View Doctors</a>
          </div>
        </div>
      `;
      setText(col.querySelector('.card-title'), h.name);
      setText(col.querySelector('.hospital-address'), h.address);
      grid.appendChild(col);
    }
  };

  let timer = null;
  const load = async () => {
    const q = search ? String(search.value || '').trim() : '';
    const data = await apiFetch(`/api/hospitals${q ? `?search=${encodeURIComponent(q)}` : ''}`, { method: 'GET' });
    render(data);
  };

  if (search) {
    search.addEventListener('input', () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        load().catch(() => {});
      }, 250);
    });
  }

  await load();
}

async function initDoctors() {
  const grid = document.getElementById('doctorsGrid');
  const specializationFilter = document.getElementById('specializationFilter');
  if (!grid || !specializationFilter) return;

  const hospitalId = qs('hospital_id');

  const specs = await apiFetch('/api/doctors/specializations', { method: 'GET' });
  specializationFilter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All Specializations';
  allOpt.selected = true;
  specializationFilter.appendChild(allOpt);
  for (const s of specs) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    specializationFilter.appendChild(opt);
  }

  const render = (doctors) => {
    grid.innerHTML = '';
    for (const d of doctors) {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-lg-4 fade-in';
      col.innerHTML = `
        <div class="card h-100 p-4 text-center">
          <div class="doctor-img-placeholder mb-3">
            <i class="bi bi-person"></i>
          </div>
          <div class="card-body d-flex flex-column p-0">
            <h5 class="card-title fw-bold mb-1"></h5>
            <p class="text-muted small mb-1 doctor-spec"></p>
            <p class="text-muted small mb-4 doctor-hospital"></p>
            <a class="btn btn-primary w-100 mt-auto" href="appointment.html?doctor_id=${encodeURIComponent(
              d.doctor_id
            )}&hospital_id=${encodeURIComponent(d.hospital_id)}">Book Appointment</a>
          </div>
        </div>
      `;
      setText(col.querySelector('.card-title'), d.full_name);
      setText(col.querySelector('.doctor-spec'), d.specialization);
      setText(col.querySelector('.doctor-hospital'), d.hospital_name);
      grid.appendChild(col);
    }
  };

  const load = async () => {
    const spec = String(specializationFilter.value || '').trim();
    const params = new URLSearchParams();
    if (spec) params.set('specialization', spec);
    if (hospitalId) params.set('hospital_id', hospitalId);
    const data = await apiFetch(`/api/doctors${params.toString() ? `?${params.toString()}` : ''}`, { method: 'GET' });
    render(data);
  };

  specializationFilter.addEventListener('change', () => {
    load().catch(() => {});
  });

  await load();
}

async function initAppointment(user) {
  const form = document.getElementById('appointmentForm');
  const hospitalSelect = document.getElementById('hospitalSelect');
  const doctorSelect = document.getElementById('doctorSelect');
  const dateSelect = document.getElementById('dateSelect');
  const timeSelect = document.getElementById('timeSelect');
  const notes = document.getElementById('additionalInfo');
  const errorBox = document.getElementById('appointmentError');
  if (!form || !hospitalSelect || !doctorSelect || !dateSelect || !timeSelect) return;

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const hospitals = await apiFetch('/api/hospitals', { method: 'GET' });
  hospitalSelect.innerHTML = '<option value="" selected disabled>Choose a hospital...</option>';
  for (const h of hospitals) {
    const opt = document.createElement('option');
    opt.value = String(h.hospital_id);
    opt.textContent = h.name;
    hospitalSelect.appendChild(opt);
  }

  async function loadDoctorsForHospital(hospitalId) {
    doctorSelect.innerHTML = '<option value="" selected disabled>Choose a doctor...</option>';
    if (!hospitalId) return;
    const data = await apiFetch(`/api/doctors?hospital_id=${encodeURIComponent(hospitalId)}`, { method: 'GET' });
    for (const d of data) {
      const opt = document.createElement('option');
      opt.value = String(d.doctor_id);
      opt.textContent = `${d.full_name} - ${d.specialization}`;
      doctorSelect.appendChild(opt);
    }
  }

  const preHospital = qs('hospital_id');
  const preDoctor = qs('doctor_id');

  if (preHospital) {
    hospitalSelect.value = preHospital;
    await loadDoctorsForHospital(preHospital);
  }
  if (preDoctor) {
    doctorSelect.value = preDoctor;
  }

  hospitalSelect.addEventListener('change', () => {
    loadDoctorsForHospital(hospitalSelect.value).catch(() => {});
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideInlineError(errorBox);
    try {
      const hospital_id = hospitalSelect.value;
      const doctor_id = doctorSelect.value;
      const date = dateSelect.value;
      const time = timeSelect.value;
      if (!hospital_id || !doctor_id || !date || !time) {
        showInlineError(errorBox, 'Please fill all required fields.');
        return;
      }
      const appointment_date = `${date} ${time}:00`;
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: {
          hospital_id: Number(hospital_id),
          doctor_id: Number(doctor_id),
          appointment_date,
          notes: notes ? notes.value : ''
        }
      });
      window.location.href = 'profile.html';
    } catch (err) {
      showInlineError(errorBox, err.message || 'Failed to book appointment');
    }
  });
}

function statusBadge(status) {
  const s = String(status || '');
  if (s === 'Scheduled') return '<span class="badge bg-primary bg-opacity-10 text-primary px-2 py-1 rounded-pill">Upcoming</span>';
  if (s === 'Completed') return '<span class="badge bg-success bg-opacity-10 text-success px-2 py-1 rounded-pill">Completed</span>';
  if (s === 'Cancelled') return '<span class="badge bg-danger bg-opacity-10 text-danger px-2 py-1 rounded-pill">Cancelled</span>';
  return `<span class="badge bg-secondary bg-opacity-10 text-secondary px-2 py-1 rounded-pill">${s}</span>`;
}

async function initProfile(user) {
  const nameEl = document.getElementById('profileName');
  const pidEl = document.getElementById('profilePatientId');
  const emailEl = document.getElementById('profileEmail');
  const phoneEl = document.getElementById('profilePhone');
  const dobEl = document.getElementById('profileDob');
  const tableBody = document.getElementById('appointmentsTbody');
  const errorBox = document.getElementById('profileError');
  const exportBtn = document.getElementById('exportCsvBtn');

  if (!nameEl || !tableBody) return;

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const profile = await apiFetch('/api/patients/me', { method: 'GET' });
    setText(nameEl, profile.full_name);
    setText(pidEl, `Patient ID: #${profile.patient_id}`);
    setText(emailEl, profile.email);
    setText(phoneEl, profile.phone || '-');
    setText(dobEl, new Date(profile.date_of_birth).toLocaleDateString());

    const appts = await apiFetch('/api/appointments/my', { method: 'GET' });
    tableBody.innerHTML = '';
    for (const a of appts) {
      const dt = formatDateTime(a.appointment_date);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="fw-medium"></div>
          <div class="text-muted small"></div>
        </td>
        <td>
          <div class="fw-medium"></div>
          <div class="text-muted small"></div>
        </td>
        <td class="appt-hospital"></td>
        <td class="appt-status"></td>
        <td class="appt-action"></td>
      `;
      setText(tr.querySelector('td:nth-child(1) .fw-medium'), dt.date);
      setText(tr.querySelector('td:nth-child(1) .text-muted'), dt.time);
      setText(tr.querySelector('td:nth-child(2) .fw-medium'), a.doctor_name);
      setText(tr.querySelector('td:nth-child(2) .text-muted'), a.specialization);
      setText(tr.querySelector('.appt-hospital'), a.hospital_name);
      tr.querySelector('.appt-status').innerHTML = statusBadge(a.status);

      const actionCell = tr.querySelector('.appt-action');
      if (a.status === 'Scheduled') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-danger';
        btn.textContent = 'Cancel';
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/appointments/${a.appointment_id}`, {
              method: 'PUT',
              body: { status: 'Cancelled' }
            });
            window.location.reload();
          } catch {
            window.location.reload();
          }
        });
        actionCell.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-secondary';
        btn.textContent = '-';
        btn.disabled = true;
        actionCell.appendChild(btn);
      }

      tableBody.appendChild(tr);
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        window.location.href = '/api/appointments/my.csv';
      });
    }
  } catch (err) {
    showInlineError(errorBox, err.message || 'Failed to load profile');
  }
}

async function initLogin(user) {
  const form = document.getElementById('loginForm');
  const identifier = document.getElementById('userId');
  const password = document.getElementById('password');
  const errorBox = document.getElementById('loginError');
  if (!form || !identifier || !password) return;

  if (user) {
    window.location.href = 'profile.html';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideInlineError(errorBox);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { identifier: identifier.value, password: password.value }
      });
      window.location.href = 'profile.html';
    } catch (err) {
      showInlineError(errorBox, err.message || 'Login failed');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  wireLogoutLinks(user);

  await Promise.all([
    initHospitals().catch(() => {}),
    initDoctors().catch(() => {}),
    initAppointment(user).catch(() => {}),
    initProfile(user).catch(() => {}),
    initLogin(user).catch(() => {})
  ]);
});

