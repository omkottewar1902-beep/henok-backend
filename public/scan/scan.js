(function () {
  const code = window.location.pathname.split('/').filter(Boolean).pop();

  // ─── Page-visible diagnostics (works without DevTools) ───────────────────
  // Query string ?debug=1 forces the panel to appear. Otherwise it only shows
  // when placeMaskedCall would refuse due to SDK not loading.
  const debugEnabled = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
  const debugLines = [];
  function debug(label, value) {
    const line = `${new Date().toISOString().slice(11, 19)}  ${label}: ${value}`;
    debugLines.push(line);
    // Trim to last 40 lines
    if (debugLines.length > 40) debugLines.shift();
    renderDebugPanel();
    // Also mirror to console for cases where DevTools IS available.
    try { console.log('[scan-diag]', label, value); } catch (_) {}
  }
  function renderDebugPanel() {
    let el = document.getElementById('debugPanel');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'debugPanel';
      el.style.cssText =
        'margin-top:20px;padding:12px;background:#111827;color:#93C5FD;border-radius:8px;font-size:11px;line-height:1.4;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow:auto;';
      document.body.appendChild(el);
    }
    el.textContent = debugLines.join('\n');
  }

  // Capture CSP + other browser errors so we can see them on-screen.
  window.addEventListener('error', (e) => {
    debug('window.error', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('securitypolicyviolation', (e) => {
    debug('CSP violation', `${e.violatedDirective} blocked ${e.blockedURI}`);
  });

  // First-run diagnostics — dump environment BEFORE anything else runs.
  debug('userAgent', navigator.userAgent);
  debug('protocol', window.location.protocol);
  debug('window.Twilio', typeof window.Twilio);
  if (window.Twilio) {
    debug('Twilio.Device', typeof window.Twilio.Device);
    debug('Twilio.version', window.Twilio.VERSION || 'unknown');
  }
  debug('mediaDevices', typeof navigator.mediaDevices);
  debug('secureContext', String(window.isSecureContext));
  if (debugEnabled) renderDebugPanel();

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
      debug('SDK check failed', `window.Twilio=${typeof window.Twilio} Device=${window.Twilio && typeof window.Twilio.Device}`);
      renderDebugPanel();
      setStatus(
        'Voice SDK did not load. See diagnostics below — if you see a CSP violation, the CSP header needs sdk.twilio.com. Otherwise try force-reloading the page.',
      );
      return;
    }
    debug('SDK check passed', `Device=${typeof window.Twilio.Device}`);
    if (activeCall) {
      // Prevent double-click while a call is already in progress.
      return;
    }

    setButtonsDisabled(true);
    setStatus('Requesting microphone permission…');

    try {
      debug('mic', 'requesting getUserMedia({audio:true})');
      await navigator.mediaDevices.getUserMedia({ audio: true });
      debug('mic', 'granted');

      setStatus('Alerting the owner…');

      const geo = await getGeolocation();
      debug('initiate', `POST /api/calls/initiate qrId=${qrId} type=${targetType}`);
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

      debug('initiate response', `status=${initiateRes.status}`);
      const initiateBody = await initiateRes.json();
      if (!initiateRes.ok) {
        debug('initiate body', JSON.stringify(initiateBody).slice(0, 200));
        throw new Error(initiateBody.message || 'Unable to place this call.');
      }

      const { voiceToken, callLogId } = initiateBody;
      debug('token', `len=${(voiceToken || '').length} callLogId=${callLogId}`);

      setStatus('Connecting a secure line…');
      await connectVoice(voiceToken, callLogId);
    } catch (err) {
      debug('placeMaskedCall threw', `${err.name || 'Error'}: ${err.message || err}`);
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
      debug('device.error', `code=${twilioError.code} ${twilioError.message}`);
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
