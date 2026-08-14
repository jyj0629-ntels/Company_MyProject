const providers = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    color: '#10a37f',
    icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 20c8-9 24-11 35-4 5 3 8 8 9 14-3-2-7-4-11-5-10-3-18 0-25 8-4 4-7 10-8 16-6-4-9-11-9-18 0-4 2-8 9-11zm15 18c7-5 14-5 20 0-2 10-10 17-20 17-9 0-16-6-18-14 6 2 12 3 18-3zm-12 2c4 7 11 10 19 10-4 5-10 8-17 8-10 0-18-7-18-17 0-2 1-4 2-6 5 2 9 3 14 5z" fill="#10a37f"/></svg>',
  },
  {
    id: 'meta',
    label: 'Meta AI',
    color: '#0081fb',
    icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 42V22h6l11 16 11-16h6v20h-6V30l-11 16h-2L24 30v12h-6z" fill="#0081fb"/></svg>',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    color: '#8b5cf6',
    icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M34 12c10 1 18 9 18 19 0 11-9 20-20 20-6 0-11-2-15-7l6-7c2 2 5 4 9 4 6 0 11-5 11-11 0-3-1-6-4-8l-5-3zm-13 12c3-8 11-14 20-14l-4 6c-5 0-9 3-11 8l-5 0zm-6 17c2-8 8-14 15-16l2 5c-4 2-8 7-9 12l-8-1z" fill="#8b5cf6"/></svg>',
  },
  {
    id: 'copilot',
    label: 'Copilot',
    color: '#2563eb',
    icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 20h15l10 12-10 12H17l10-12-10-12zm18 5l-7 7 7 7h7l-7-7 7-7h-7zm-3 20h7l-4 7h-7l4-7z" fill="#2563eb"/></svg>',
  },
  {
    id: 'grok',
    label: 'Grok',
    color: '#f59e0b',
    icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 18h8l12 13 9-13h8l-15 19 16 19h-8l-11-13-10 13h-8l15-19-17-19zm16 9l-7 9 7 9h6l-7-9 7-9h-6z" fill="#f59e0b"/></svg>',
  },
];

const DEFAULT_GAS_ENDPOINT = 'https://script.google.com/macros/s/PASTE_YOUR_SCRIPT_ID/exec';
const DEFAULT_CONFIG_PATH = './config.json';
const statusBar = document.getElementById('statusBar');
const resultGrid = document.getElementById('resultGrid');
const questionInput = document.getElementById('questionInput');
const googleIdInput = document.getElementById('googleId');
const googlePwdInput = document.getElementById('googlePwd');
const providerList = document.getElementById('providerList');
const resultFrames = {};
let gasEndpoint = '';

function renderProviderList() {
  providerList.innerHTML = providers
    .map(
      (provider) => `
        <div class="provider-item">
          <input id="check-${provider.id}" type="checkbox" checked />
          <label for="check-${provider.id}">
            <span class="provider-badge" style="background:transparent;border-radius:0;box-shadow:none;border:none;">${provider.icon}</span>
            <span>${provider.label}</span>
          </label>
        </div>
      `
    )
    .join('');
}

function buildResultPanel(provider) {
  const panel = document.createElement('article');
  panel.className = 'result-panel';
  panel.dataset.provider = provider.id;

  panel.innerHTML = `
    <div class="result-header">
      <strong>${provider.label}</strong>
      <button type="button" class="full-btn">전체 보기</button>
    </div>
    <div class="loading-text">대기 중...</div>
  `;

  const iframe = document.createElement('iframe');
  iframe.className = 'result-frame';
  iframe.title = `${provider.label} response`;
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.display = 'none';

  panel.appendChild(iframe);
  resultFrames[provider.id] = iframe;

  panel.querySelector('.full-btn').addEventListener('click', () => {
    const doc = iframe.srcdoc || '<html><body>응답이 없습니다.</body></html>';
    const newTab = window.open('', '_blank');
    newTab.document.write(doc);
    newTab.document.close();
  });

  return panel;
}

function renderResultPanels() {
  resultGrid.innerHTML = '';
  providers.forEach((provider) => {
    const panel = buildResultPanel(provider);
    resultGrid.appendChild(panel);
  });
}

function getSelectedProviders() {
  return providers.filter((provider) => {
    const checkbox = document.getElementById(`check-${provider.id}`);
    return checkbox && checkbox.checked;
  });
}

function setStatus(message, isError = false) {
  statusBar.textContent = message;
  statusBar.style.color = isError ? '#fca5a5' : '#cbd5e1';
}

function showLoadingState(providerId) {
  const panel = document.querySelector(`.result-panel[data-provider="${providerId}"]`);
  if (!panel) return;

  const loading = panel.querySelector('.loading-text');
  const iframe = resultFrames[providerId];
  if (loading) loading.style.display = 'flex';
  if (iframe) {
    iframe.style.display = 'none';
    iframe.srcdoc = '';
  }
}

function updatePanelWithResponse(providerId, html) {
  const panel = document.querySelector(`.result-panel[data-provider="${providerId}"]`);
  const iframe = resultFrames[providerId];

  if (!panel || !iframe) return;

  const loading = panel.querySelector('.loading-text');
  if (loading) loading.style.display = 'none';

  iframe.srcdoc = html;
  iframe.style.display = 'block';
}

function buildResponseHtml(provider, question, answer) {
  const safeQuestion = escapeHtml(question);
  const safeAnswer = escapeHtml(answer);

  return `
    <!DOCTYPE html>
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: 'Segoe UI', sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
          .wrap { padding: 20px; }
          .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-weight: 700; margin-bottom: 12px; }
          .question { background: #ffffff; border: 1px solid #dbeafe; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
          .answer { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; line-height: 1.7; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="badge">${provider.label}</div>
          <div class="question"><strong>질문</strong><br>${safeQuestion}</div>
          <div class="answer"><strong>응답</strong><br>${safeAnswer}</div>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadConfigFromFile() {
  try {
    const response = await fetch(DEFAULT_CONFIG_PATH, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && data.gasUrl) {
      gasEndpoint = data.gasUrl;
      return data;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function loadConfigFromGAS() {
  const googleId = googleIdInput?.value?.trim();
  const googlePwd = googlePwdInput?.value?.trim();

  if (!googleId || !googlePwd) {
    throw new Error('Google ID와 PWD를 입력해 주세요.');
  }

  const response = await fetch(DEFAULT_GAS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'getConfig',
      googleId,
      googlePwd,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GAS 설정 로드 실패: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.gasUrl) {
    throw new Error('GAS 설정 데이터가 올바르지 않습니다.');
  }

  gasEndpoint = data.gasUrl;
  return data;
}

async function ensureGasEndpoint() {
  if (gasEndpoint) {
    return gasEndpoint;
  }

  const configData = await loadConfigFromFile();
  if (configData && configData.gasUrl) {
    return configData.gasUrl;
  }

  const fallback = await loadConfigFromGAS();
  if (fallback && fallback.gasUrl) {
    return fallback.gasUrl;
  }

  throw new Error('GAS 설정 정보를 찾을 수 없습니다.');
}

async function callProvider(providerId, question) {
  const endpoint = await ensureGasEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: providerId,
      question,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GAS 호출 실패: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const answer = data.answer || data.text || '응답이 비어 있습니다.';

  return {
    provider: providers.find((item) => item.id === providerId)?.label || providerId,
    answer,
  };
}

async function submitQuestion() {
  const selected = getSelectedProviders();
  const question = questionInput.value.trim();

  if (!question) {
    setStatus('질문 내용을 입력해 주세요.', true);
    questionInput.focus();
    return;
  }

  if (!selected.length) {
    setStatus('최소 한 개 이상의 AI를 선택해 주세요.', true);
    return;
  }

  const gasEndpoint = getGasEndpoint();
  if (!gasEndpoint) {
    setStatus('Google Apps Script URL을 먼저 입력해 주세요.', true);
    gasUrlInput?.focus();
    return;
  }

  setStatus(`${selected.length}개 AI에 질문을 전송 중입니다.`);

  for (const provider of selected) {
    showLoadingState(provider.id);
  }

  try {
    const tasks = selected.map(async (provider) => {
      const result = await callProvider(provider.id, question);
      const html = buildResponseHtml(
        providers.find((item) => item.id === provider.id),
        question,
        result.answer
      );
      updatePanelWithResponse(provider.id, html);
    });

    await Promise.all(tasks);
    setStatus('질문이 완료되었습니다. 각 AI 결과를 비교해 보세요.');
  } catch (error) {
    setStatus(error.message || 'GAS 연동 중 문제가 발생했습니다.', true);
    console.error(error);
  }
}

document.getElementById('runBtn').addEventListener('click', submitQuestion);

questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  questionInput.value = '';
  googleIdInput.value = '';
  googlePwdInput.value = '';
  gasEndpoint = '';
  setStatus('로그인 정보를 다시 입력해 주세요.');
  questionInput.focus();
});

renderProviderList();
renderResultPanels();
setStatus('Google ID/PWD를 입력한 뒤 질문을 보내세요.');
