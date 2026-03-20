let sessions = [];
let campaigns = [];
let logs = [];
let currentCampaignId = null;

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function getStatusClass(status) {
  const statusMap = {
    'ACTIVE': 'status-active',
    'LOADING': 'status-loading',
    'QR_REQUIRED': 'status-qr',
    'RUNNING': 'status-running',
    'PAUSED': 'status-paused',
    'DRAFT': 'status-draft',
    'STOPPED': 'status-stopped',
    'COMPLETED': 'status-completed',
  };
  return statusMap[status] || '';
}

function getStatusText(status) {
  const statusMap = {
    'ACTIVE': 'Active',
    'LOADING': 'Loading',
    'QR_REQUIRED': 'QR Required',
    'RUNNING': 'Running',
    'PAUSED': 'Paused',
    'DRAFT': 'Draft',
    'STOPPED': 'Stopped',
    'COMPLETED': 'Completed',
  };
  return statusMap[status] || status;
}

function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.id = `session-${session.id}`;

  const deviceNumber = sessions.indexOf(session) + 1;
  const visibilityClass = session.isVisible ? 'visibility-visible' : 'visibility-hidden';
  const visibilityText = session.isVisible ? 'Visible' : 'Hidden';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <span class="visibility-indicator ${visibilityClass}" title="${visibilityText}"></span>
        DEVICE ${String(deviceNumber).padStart(3, '0')}
      </div>
      <span class="status-badge ${getStatusClass(session.status)}">
        ${getStatusText(session.status)}
      </span>
    </div>
    <div class="card-info">
      <div>
        <span class="info-label">ID</span>
        <span class="info-value">${session.id.substring(0, 16)}...</span>
      </div>
      <div>
        <span class="info-label">Created</span>
        <span class="info-value">${formatDate(session.createdAt)}</span>
      </div>
      <div>
        <span class="info-label">Last Active</span>
        <span class="info-value">${formatDate(session.lastActive)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button class="btn btn-secondary" onclick="openChat('${session.id}')">OPEN</button>
      <button class="btn btn-warning" onclick="refreshSession('${session.id}')">REFRESH</button>
      <button class="btn btn-danger" onclick="deleteSession('${session.id}')">DELETE</button>
    </div>
  `;

  return card;
}

function createCampaignCard(campaign) {
  const card = document.createElement('div');
  card.className = 'campaign-card';
  card.id = `campaign-${campaign.id}`;
  card.onclick = () => viewCampaignDetail(campaign.id);
  card.style.cursor = 'pointer';

  const completionPercent = campaign.stats.total > 0
    ? Math.round((campaign.stats.sent + campaign.stats.failed) / campaign.stats.total * 100)
    : 0;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${campaign.name}</div>
      <span class="status-badge ${getStatusClass(campaign.status)}">
        ${getStatusText(campaign.status)}
      </span>
    </div>
    <div class="card-info">
      <div>
        <span class="info-label">Total Contacts</span>
        <span class="info-value">${campaign.stats.total}</span>
      </div>
      <div>
        <span class="info-label">Sent</span>
        <span class="info-value" style="color: var(--success-green)">${campaign.stats.sent}</span>
      </div>
      <div>
        <span class="info-label">Failed</span>
        <span class="info-value" style="color: var(--danger-red)">${campaign.stats.failed}</span>
      </div>
      <div>
        <span class="info-label">Pending</span>
        <span class="info-value" style="color: var(--warning-yellow)">${campaign.stats.pending}</span>
      </div>
      <div>
        <span class="info-label">Progress</span>
        <span class="info-value">${completionPercent}%</span>
      </div>
      <div>
        <span class="info-label">Created</span>
        <span class="info-value">${formatDate(campaign.createdAt)}</span>
      </div>
    </div>
  `;

  return card;
}

function renderSessions() {
  const container = document.getElementById('sessions-container');
  const deviceCount = document.getElementById('device-count');

  container.innerHTML = '';

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">▣</div>
        <p class="empty-text">NO DEVICES CONNECTED</p>
        <p class="empty-hint">Click "ADD DEVICE" to connect your first WhatsApp account</p>
      </div>
    `;
  } else {
    sessions.forEach(session => {
      container.appendChild(createSessionCard(session));
    });
  }

  const activeCount = sessions.filter(s => s.status === 'ACTIVE').length;
  deviceCount.textContent = activeCount;
}

function renderCampaigns() {
  const container = document.getElementById('campaigns-container');
  const campaignCount = document.getElementById('campaign-count');

  container.innerHTML = '';

  if (campaigns.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚡</div>
        <p class="empty-text">NO CAMPAIGNS CREATED</p>
        <p class="empty-hint">Click "CREATE CAMPAIGN" to set up your first messaging campaign</p>
      </div>
    `;
  } else {
    campaigns.forEach(campaign => {
      container.appendChild(createCampaignCard(campaign));
    });
  }

  campaignCount.textContent = campaigns.length;
}

async function addDevice() {
  try {
    await window.electronAPI.addSession();
  } catch (error) {
    console.error('Error adding device:', error);
    alert('Failed to add device');
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Are you sure you want to delete this device? This will remove all session data.')) {
    return;
  }

  try {
    await window.electronAPI.deleteSession(sessionId);
  } catch (error) {
    console.error('Error deleting session:', error);
    alert('Failed to delete device');
  }
}

async function openChat(sessionId) {
  try {
    await window.electronAPI.openChat(sessionId);
  } catch (error) {
    console.error('Error opening chat:', error);
    alert('Failed to open chat window');
  }
}

async function refreshSession(sessionId) {
  try {
    await window.electronAPI.refreshSession(sessionId);
  } catch (error) {
    console.error('Error refreshing session:', error);
    alert('Failed to refresh session');
  }
}

async function loadSessions() {
  try {
    sessions = await window.electronAPI.listSessions();
    renderSessions();
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

async function loadCampaigns() {
  try {
    campaigns = await window.electronAPI.listCampaigns();
    renderCampaigns();
  } catch (error) {
    console.error('Error loading campaigns:', error);
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  const activeTab = document.getElementById(`${tabName}-tab`);
  if (activeTab) {
    activeTab.classList.add('active');
  }

  document.getElementById('campaign-detail-view').classList.add('hidden');
}

function showCampaignModal() {
  const modal = document.getElementById('campaign-modal');
  modal.classList.remove('hidden');

  updateDeviceSelector();
}

function hideCampaignModal() {
  const modal = document.getElementById('campaign-modal');
  modal.classList.add('hidden');

  document.getElementById('campaign-form').reset();
}

function updateDeviceSelector() {
  const selector = document.getElementById('device-selector');
  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');

  if (activeSessions.length === 0) {
    selector.innerHTML = '<p class="empty-hint">No active devices available</p>';
    return;
  }

  selector.innerHTML = '';
  activeSessions.forEach((session, index) => {
    const option = document.createElement('div');
    option.className = 'device-option';
    option.innerHTML = `
      <input type="checkbox" id="device-${session.id}" value="${session.id}" checked>
      <label for="device-${session.id}">Device ${String(index + 1).padStart(3, '0')}</label>
    `;
    selector.appendChild(option);
  });
}

async function handleCampaignSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('campaign-name').value;
  const message = document.getElementById('campaign-message').value;
  const contactsText = document.getElementById('campaign-contacts').value;
  const countryCode = document.getElementById('campaign-country-code').value;
  const minDelay = parseInt(document.getElementById('campaign-min-delay').value) * 1000;
  const maxDelay = parseInt(document.getElementById('campaign-max-delay').value) * 1000;

  const contacts = contactsText
    .split('\n')
    .map(line => line.trim().replace(/[^0-9]/g, ''))
    .filter(num => num.length > 0);

  if (contacts.length === 0) {
    alert('Please add at least one contact number');
    return;
  }

  const selectedDevices = Array.from(
    document.querySelectorAll('#device-selector input[type="checkbox"]:checked')
  ).map(checkbox => checkbox.value);

  if (selectedDevices.length === 0) {
    alert('Please select at least one device');
    return;
  }

  const campaignData = {
    name,
    message,
    variations: [],
    contacts,
    countryCode: countryCode.startsWith('+') ? countryCode : '+' + countryCode,
    selectedDevices,
    minDelay,
    maxDelay,
  };

  try {
    await window.electronAPI.createCampaign(campaignData);
    hideCampaignModal();
    await loadCampaigns();
  } catch (error) {
    console.error('Error creating campaign:', error);
    alert('Failed to create campaign');
  }
}

async function viewCampaignDetail(campaignId) {
  currentCampaignId = campaignId;
  const campaign = campaigns.find(c => c.id === campaignId);

  if (!campaign) {
    console.error('Campaign not found');
    return;
  }

  document.getElementById('campaigns-tab').classList.remove('active');
  document.getElementById('campaign-detail-view').classList.remove('hidden');

  document.getElementById('detail-campaign-name').textContent = campaign.name;

  updateCampaignStats(campaign);
  updateCampaignControls(campaign);

  await loadCampaignLogs(campaignId);
}

function updateCampaignStats(campaign) {
  document.getElementById('stat-total').textContent = campaign.stats.total;
  document.getElementById('stat-sent').textContent = campaign.stats.sent;
  document.getElementById('stat-failed').textContent = campaign.stats.failed;
  document.getElementById('stat-pending').textContent = campaign.stats.pending;

  const percent = campaign.stats.total > 0
    ? Math.round((campaign.stats.sent + campaign.stats.failed) / campaign.stats.total * 100)
    : 0;

  document.getElementById('progress-percent').textContent = `${percent}%`;
  document.getElementById('progress-fill').style.width = `${percent}%`;
}

function updateCampaignControls(campaign) {
  const startBtn = document.getElementById('start-campaign-ctrl');
  const pauseBtn = document.getElementById('pause-campaign-ctrl');
  const resumeBtn = document.getElementById('resume-campaign-ctrl');
  const stopBtn = document.getElementById('stop-campaign-ctrl');

  startBtn.classList.add('hidden');
  pauseBtn.classList.add('hidden');
  resumeBtn.classList.add('hidden');
  stopBtn.classList.add('hidden');

  if (campaign.status === 'DRAFT') {
    startBtn.classList.remove('hidden');
  } else if (campaign.status === 'RUNNING') {
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    document.getElementById('log-status').textContent = 'ACTIVE';
  } else if (campaign.status === 'PAUSED') {
    resumeBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    document.getElementById('log-status').textContent = 'PAUSED';
  } else {
    document.getElementById('log-status').textContent = campaign.status;
  }
}

async function loadCampaignLogs(campaignId) {
  try {
    const campaignLogs = await window.electronAPI.getLogs(campaignId);
    renderLogs(campaignLogs);
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

function renderLogs(logEntries) {
  const logContent = document.getElementById('log-content');

  if (!logEntries || logEntries.length === 0) {
    logContent.innerHTML = '<div class="empty-hint">No log entries yet</div>';
    return;
  }

  logContent.innerHTML = '';
  logEntries.forEach(log => {
    const entry = document.createElement('div');
    const levelClass = `log-entry-${log.level.toLowerCase()}`;
    entry.className = `log-entry ${levelClass}`;
    entry.innerHTML = `
      <span class="log-timestamp">[${formatTime(log.timestamp)}]</span>
      <span>${log.message}</span>
    `;
    logContent.appendChild(entry);
  });

  logContent.scrollTop = logContent.scrollHeight;
}

function backToCampaigns() {
  currentCampaignId = null;
  document.getElementById('campaign-detail-view').classList.add('hidden');
  document.getElementById('campaigns-tab').classList.add('active');
}

async function startCampaign() {
  if (!currentCampaignId) return;

  if (!confirm('Start this campaign? Messages will begin sending immediately.')) {
    return;
  }

  try {
    await window.electronAPI.startCampaign(currentCampaignId);
  } catch (error) {
    console.error('Error starting campaign:', error);
    alert('Failed to start campaign: ' + error.message);
  }
}

async function pauseCampaign() {
  if (!currentCampaignId) return;

  try {
    await window.electronAPI.pauseCampaign(currentCampaignId);
  } catch (error) {
    console.error('Error pausing campaign:', error);
    alert('Failed to pause campaign');
  }
}

async function resumeCampaign() {
  if (!currentCampaignId) return;

  try {
    await window.electronAPI.resumeCampaign(currentCampaignId);
  } catch (error) {
    console.error('Error resuming campaign:', error);
    alert('Failed to resume campaign');
  }
}

async function stopCampaign() {
  if (!currentCampaignId) return;

  if (!confirm('Stop this campaign? This cannot be undone and remaining messages will not be sent.')) {
    return;
  }

  try {
    await window.electronAPI.stopCampaign(currentCampaignId);
  } catch (error) {
    console.error('Error stopping campaign:', error);
    alert('Failed to stop campaign');
  }
}

document.getElementById('add-device-btn').addEventListener('click', addDevice);
document.getElementById('create-campaign-btn').addEventListener('click', showCampaignModal);
document.getElementById('close-campaign-modal').addEventListener('click', hideCampaignModal);
document.getElementById('cancel-campaign-btn').addEventListener('click', hideCampaignModal);
document.getElementById('campaign-form').addEventListener('submit', handleCampaignSubmit);

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('back-to-campaigns-btn').addEventListener('click', backToCampaigns);
document.getElementById('start-campaign-ctrl').addEventListener('click', startCampaign);
document.getElementById('pause-campaign-ctrl').addEventListener('click', pauseCampaign);
document.getElementById('resume-campaign-ctrl').addEventListener('click', resumeCampaign);
document.getElementById('stop-campaign-ctrl').addEventListener('click', stopCampaign);

window.electronAPI.onSessionUpdate((updatedSessions) => {
  sessions = updatedSessions;
  renderSessions();
});

window.electronAPI.onCampaignUpdate((updatedCampaigns) => {
  campaigns = updatedCampaigns;
  renderCampaigns();

  if (currentCampaignId) {
    const campaign = campaigns.find(c => c.id === currentCampaignId);
    if (campaign) {
      updateCampaignStats(campaign);
      updateCampaignControls(campaign);
    }
  }
});

window.electronAPI.onLogUpdate((updatedLogs) => {
  if (currentCampaignId) {
    const campaignLogs = updatedLogs.filter(log => log.campaignId === currentCampaignId);
    renderLogs(campaignLogs);
  }
});

window.addEventListener('click', (e) => {
  if (e.target.id === 'campaign-modal') {
    hideCampaignModal();
  }
});

loadSessions();
loadCampaigns();
