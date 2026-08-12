(function () {
  const code = window.location.pathname.split('/').filter(Boolean).pop();

  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const errorEl = document.getElementById('errorState');
  const qrTypeEl = document.getElementById('qrType');
  const qrLabelEl = document.getElementById('qrLabel');
  const ownerNameEl = document.getElementById('ownerName');
  const ownerMobileEl = document.getElementById('ownerMobile');
  const contactsBlockEl = document.getElementById('contactsBlock');
  const contactsListEl = document.getElementById('contactsList');
  const callOwnerBtn = document.getElementById('callOwnerBtn');
  const callStatusEl = document.getElementById('callStatus');

  let qrId = null;
  let device = null;

  function showError(message) {
    loadingEl.classList.add('hidden');
    contentEl.classList.add('hidden');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  function setStatus(message) {
    callStatusEl.textContent = message;
    callStatusEl.classList.remove('hidden');
  }

  function getGeolocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 4000 },
      );
    });
  }

  async function loadQrData() {
    const geo = await getGeolocation();
    const query = new URLSearchParams();
    if (geo.lat !== undefined) query.set('lat', geo.lat);
    if (geo.lng !== undefined) query.set('lng', geo.lng);

    const res = await fetch(`/api/scan/${encodeURIComponent(code)}?${query.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'This QR code is not available.');
    }
    return res.json();
  }

  function render(data) {
    qrId = data.qrId;
    qrTypeEl.textContent = data.type;
    qrLabelEl.textContent = data.label;
    ownerNameEl.textContent = data.owner.name;
    ownerMobileEl.textContent = data.owner.mobile;

    if (data.emergencyContacts.length > 0) {
      contactsBlockEl.classList.remove('hidden');
      contactsListEl.innerHTML = '';
      data.emergencyContacts.forEach((contact) => {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = `
          <div class="contact-meta">
            <p class="masked-name">${contact.name}</p>
            <p class="relationship">${contact.relationship} &middot; ${contact.mobile}</p>
          </div>
          <button class="btn btn-secondary btn-small" data-contact-id="${contact.id}">
            &#128101; Call
          </button>
        `;
        row.querySelector('button').addEventListener('click', () => placeCall('EMERGENCY', contact.id));
        contactsListEl.appendChild(row);
      });
    }

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  }

  async function placeCall(targetType, contactId) {
    document.querySelectorAll('.btn').forEach((btn) => (btn.disabled = true));
    setStatus('Connecting your call securely...');

    try {
      const geo = await getGeolocation();
      const res = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrId,
          targetType,
          contactId,
          latitude: geo.lat,
          longitude: geo.lng,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || 'Unable to place this call.');
      }

      setStatus('Alert sent. Opening secure line...');
      await startVoiceCall(body.voiceToken, body.callLogId);
    } catch (err) {
      setStatus(err.message || 'Something went wrong. Please try again.');
      document.querySelectorAll('.btn').forEach((btn) => (btn.disabled = false));
    }
  }

  async function startVoiceCall(token, callLogId) {
    if (!window.Twilio || !window.Twilio.Device) {
      setStatus('Voice calling is unavailable in this browser.');
      return;
    }

    device = new window.Twilio.Device(token, { closeProtection: true });

    device.on('error', (err) => {
      setStatus(`Call error: ${err.message}`);
      document.querySelectorAll('.btn').forEach((btn) => (btn.disabled = false));
    });

    const connection = await device.connect({ params: { callLogId } });

    connection.on('accept', () => setStatus('Connected. Stay on the line.'));
    connection.on('disconnect', () => {
      setStatus('Call ended.');
      document.querySelectorAll('.btn').forEach((btn) => (btn.disabled = false));
    });
  }

  callOwnerBtn.addEventListener('click', () => placeCall('OWNER'));

  loadQrData().then(render).catch((err) => showError(err.message));
})();
