/* eslint-disable */
const btn = document.getElementById('allow');
const status = document.getElementById('status');
let resolved = false;

function onGranted() {
  if (resolved) return;
  resolved = true;
  status.className = 'status success';
  status.textContent = '\u2713 Microphone enabled! This tab will close in a moment.';
  btn.disabled = true;
  btn.textContent = 'Allowed';
  chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: true });
  setTimeout(() => window.close(), 1500);
}

// Watch for permission changes (e.g. user grants via Chrome UI after initial denial)
try {
  navigator.permissions.query({ name: 'microphone' }).then(permStatus => {
    if (permStatus.state === 'granted') {
      onGranted();
      return;
    }
    permStatus.addEventListener('change', () => {
      if (permStatus.state === 'granted') onGranted();
    });
  });
} catch {
  /* Permissions API not available — rely on getUserMedia only */
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  btn.textContent = 'Requesting...';
  status.className = 'status';
  status.textContent = '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    onGranted();
  } catch (err) {
    if (resolved) return; // Permission was granted via another path while we waited
    status.className = 'status error';
    if (err.message?.includes('denied') || err.name === 'NotAllowedError') {
      const isMac = navigator.platform?.toLowerCase().includes('mac');
      status.innerHTML = isMac
        ? 'Microphone access denied.<br>Check System Settings \u2192 Privacy & Security \u2192 Microphone<br>and allow Chrome to access it.'
        : 'Microphone access denied.<br>Check Windows Settings \u2192 Privacy \u2192 Microphone<br>and allow Chrome to access it.';
    } else {
      status.textContent = 'Error: ' + err.message;
    }
    btn.disabled = false;
    btn.textContent = 'Try Again';
  }
});
