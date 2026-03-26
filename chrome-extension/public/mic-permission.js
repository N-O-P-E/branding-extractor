/* eslint-disable */
const btn = document.getElementById('allow');
const status = document.getElementById('status');
btn.addEventListener('click', async () => {
  btn.disabled = true;
  btn.textContent = 'Requesting...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    status.className = 'status success';
    status.textContent = '\u2713 Microphone enabled! This tab will close in a moment.';
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: true });
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    status.className = 'status error';
    if (err.message?.includes('denied') || err.name === 'NotAllowedError') {
      status.innerHTML =
        'Microphone access denied.<br>Check Windows Settings \u2192 Privacy \u2192 Microphone<br>and allow Chrome to access it.';
    } else {
      status.textContent = 'Error: ' + err.message;
    }
    btn.disabled = false;
    btn.textContent = 'Try Again';
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: false });
  }
});
