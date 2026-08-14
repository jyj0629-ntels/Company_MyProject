function doGet() {
  return ContentService.createTextOutput('AI Proxy Ready').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const provider = (payload.provider || '').toLowerCase();
    const question = String(payload.question || '').trim();

    if (!provider || !question) {
      return jsonResponse({ ok: false, error: 'provider와 question이 필요합니다.' }, 400);
    }

    const keys = getStoredKeys();
    const apiKey = keys[provider];

    if (!apiKey) {
      return jsonResponse({ ok: false, error: `${provider} API key가 설정되지 않았습니다.` }, 400);
    }

    let answer = '';

    switch (provider) {
      case 'chatgpt':
        answer = callOpenAI(apiKey, question);
        break;
      case 'gemini':
        answer = callGemini(apiKey, question);
        break;
      case 'grok':
        answer = callGrok(apiKey, question);
        break;
      case 'copilot':
        answer = callCopilot(apiKey, question);
        break;
      default:
        return jsonResponse({ ok: false, error: '지원하지 않는 provider입니다.' }, 400);
    }

    return jsonResponse({ ok: true, provider, answer });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || '서버 처리 중 오류가 발생했습니다.' }, 500);
  }
}

function getStoredKeys() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('AI_KEYS') || '{}';
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function jsonResponse(data, statusCode = 200) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function callOpenAI(apiKey, question) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: question }],
    temperature: 0.7,
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error(data.error?.message || 'OpenAI 호출 실패');
  }

  return data.choices?.[0]?.message?.content || 'OpenAI 응답이 비어 있습니다.';
}

function callGemini(apiKey, question) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: question }],
    }],
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error(data.error?.message || 'Gemini 호출 실패');
  }

  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || 'Gemini 응답이 비어 있습니다.';
}

function callGrok(apiKey, question) {
  const url = 'https://api.x.ai/v1/chat/completions';
  const payload = {
    model: 'grok-beta',
    messages: [{ role: 'user', content: question }],
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error(data.error?.message || 'Grok 호출 실패');
  }

  return data.choices?.[0]?.message?.content || 'Grok 응답이 비어 있습니다.';
}

function callCopilot(apiKey, question) {
  const url = 'https://api.githubcopilot.com/chat/completions';
  const payload = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: question }],
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Editor-Version': 'vscode/1.0',
      'Copilot-Integration-Id': 'vscode-chat',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(res.getContentText());
  if (res.getResponseCode() >= 400) {
    throw new Error(data.error?.message || 'Copilot 호출 실패');
  }

  return data.choices?.[0]?.message?.content || 'Copilot 응답이 비어 있습니다.';
}

function setExampleKeys() {
  const props = PropertiesService.getScriptProperties();
  const keys = {
    chatgpt: 'PASTE_OPENAI_KEY',
    gemini: 'PASTE_GEMINI_KEY',
    grok: 'PASTE_GROK_KEY',
    copilot: 'PASTE_COPILOT_KEY',
  };
  props.setProperty('AI_KEYS', JSON.stringify(keys));
}
