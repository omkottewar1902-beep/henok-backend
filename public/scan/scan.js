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
  let activeCall = null;

  // ─── UI helpers ───────────────────────────────────────────────────────────

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

  function setButtonsDisabled(disabled) {
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function ensureEndCallButton() {
    let endBtn = document.getElementById('endCallBtn');
    if (endBtn) return endBtn;
    endBtn = document.createElement('button');
    endBtn.id = 'endCallBtn';
    endBtn.className = 'btn btn-secondary';
    endBtn.textContent = 'End call';
    endBtn.style.marginTop = '10px';
    endBtn.addEventListener('click', () => {
      if (activeCall) activeCall.disconnect();
    });
    callStatusEl.insertAdjacentElement('afterend', endBtn);
    return endBtn;
  }

  function hideEndCallButton() {
    const b = document.getElementById('endCallBtn');
    if (b) b.remove();
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

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
        row.querySelector('button').addEventListener('click', () =>
          placeMaskedCall('EMERGENCY', contact.id),
        );
        contactsListEl.appendChild(row);
      });
    }

    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  }

  // ─── Masked call flow (Twilio Voice SDK) ──────────────────────────────────

  async function placeMaskedCall(targetType, contactId) {
    if (!window.Twilio || !window.Twilio.Device) {
      setStatus('Masked calling is not supported in this browser. Please try Chrome, Safari, or Firefox.');
      return;
    }
    if (activeCall) {
      // Prevent double-click while a call is already in progress.
      return;
    }

    setButtonsDisabled(true);
    setStatus('Requesting microphone permission…');

    try {
      // Trigger the browser's mic permission prompt up front. This also
      // primes the audio context so the incoming call audio autoplays.
      await navigator.mediaDevices.getUserMedia({ audio: true });

      setStatus('Alerting the owner…');

      const geo = await getGeolocation();
      const initiateRes = await fetch('/api/calls/initiate', {
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

      const initiateBody = await initiateRes.json();
      if (!initiateRes.ok) {
        throw new Error(initiateBody.message || 'Unable to place this call.');
      }

      const { voiceToken, callLogId } = initiateBody;

      setStatus('Connecting a secure line…');
      await connectVoice(voiceToken, callLogId);
    } catch (err) {
      setStatus(friendlyError(err));
      cleanupCall();
    }
  }

  async function connectVoice(token, callLogId) {
    // Tear down any previous Device instance from an earlier attempt.
    if (device) {
      try { device.destroy(); } catch (_) { /* noop */ }
      device = null;
    }

    device = new window.Twilio.Device(token, {
      logLevel: 'warn',
      codecPreferences: ['opus', 'pcmu'],
      closeProtection: true,
    });

    device.on('error', (twilioError) => {
      setStatus(`Call error: ${twilioError.message || 'unknown'}`);
      cleanupCall();
    });

    // Kick off the outgoing call. Twilio will POST to /api/calls/voice-webhook
    // with `callLogId` in the body; our webhook returns TwiML that dials the
    // resolved owner / contact number and bridges the browser to the callee.
    activeCall = await device.connect({ params: { callLogId } });

    activeCall.on('accept', () => {
      setStatus('Connected. Stay on the line.');
      ensureEndCallButton();
    });
    activeCall.on('reject', () => {
      setStatus('Owner declined the call.');
      cleanupCall();
    });
    activeCall.on('cancel', () => {
      setStatus('Call cancelled.');
      cleanupCall();
    });
    activeCall.on('disconnect', () => {
      setStatus('Call ended.');
      cleanupCall();
    });
    activeCall.on('error', (twilioError) => {
      setStatus(`Call error: ${twilioError.message || 'unknown'}`);
      cleanupCall();
    });
  }

  function cleanupCall() {
    activeCall = null;
    hideEndCallButton();
    setButtonsDisabled(false);
    if (device) {
      try { device.destroy(); } catch (_) { /* noop */ }
      device = null;
    }
  }

  function friendlyError(err) {
    if (!err) return 'Something went wrong.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Microphone access was blocked. Please allow the mic and try again.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No microphone detected on this device.';
    }
    return err.message || 'Something went wrong.';
  }

  // ─── Wiring ───────────────────────────────────────────────────────────────

  callOwnerBtn.addEventListener('click', () => placeMaskedCall('OWNER'));

  loadQrData().then(render).catch((err) => showError(err.message));
})();
