/* Inovatry Solutions — formulario config-driven (PR 4). Contrato CSS: css/style.css parte 2. */
'use strict';

const state = { config: null, files: [], lastSubmitAt: 0 };
const COOLDOWN_MS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function el(id) { return document.getElementById(id); }

function showMessage(text, kind) {
  const msg = el('formMessage');
  msg.textContent = text;
  msg.className = 'form-message ' + kind;
}

function showFieldError(fieldId, text) {
  const group = el('group-' + fieldId);
  let err = group.querySelector('.error-message');
  if (!err) {
    err = document.createElement('div');
    err.className = 'error-message';
    group.appendChild(err);
  }
  err.textContent = text;
}

function clearFieldError(fieldId) {
  const group = el('group-' + fieldId);
  const err = group.querySelector('.error-message');
  if (err) err.remove();
}

async function loadConfig() {
  try {
    const res = await fetch('js/form-config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.config = await res.json();
    applyStrings(state.config);
    renderForm(state.config);
  } catch (err) {
    el('contactForm').hidden = true; // nunca un formulario vacío
    showMessage('No se pudo cargar la configuración del formulario. Inténtalo de nuevo más tarde.', 'error');
  }
}

function applyStrings(config) {
  const hero = config.hero;
  const form = config.form;
  const h1 = document.querySelector('.hero h1');
  if (h1 && hero) h1.textContent = hero.title;
  const heroP = document.querySelector('.hero p');
  if (heroP && hero) heroP.textContent = hero.description;
  const title = document.querySelector('.form-title');
  if (title && form) title.textContent = form.title;
  const subtitle = document.querySelector('.form-subtitle');
  if (!subtitle || !form) return;
  subtitle.textContent = '';
  form.subtitle.split('*').forEach(function (part, i) {
    if (i > 0) {
      const star = document.createElement('span');
      star.className = 'required';
      star.textContent = '*';
      subtitle.appendChild(star);
    }
    if (part) subtitle.appendChild(document.createTextNode(part));
  });
}

function renderForm(config) {
  const grid = document.querySelector('.form-grid');
  config.fields.forEach(function (field) { grid.appendChild(createFieldGroup(field)); });
  el('contactForm').addEventListener('submit', handleSubmit);
}

function createFieldGroup(field) {
  const group = document.createElement('div');
  group.className = 'form-group' + (field.fullWidth ? ' full-width' : '');
  group.id = 'group-' + field.id;

  if (field.type === 'honeypot') {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'field-' + field.id;
    input.name = field.id;
    input.tabIndex = -1;
    input.autocomplete = 'off';
    input.setAttribute('aria-hidden', 'true');
    input.style.display = 'none';
    group.appendChild(input);
    return group;
  }

  const label = document.createElement('label');
  label.htmlFor = 'field-' + field.id;
  label.textContent = field.label;
  if (field.required) {
    label.appendChild(document.createTextNode(' '));
    const star = document.createElement('span');
    star.className = 'required';
    star.textContent = '*';
    label.appendChild(star);
  }
  group.appendChild(label);

  let control;
  let appended = false;
  if (field.type === 'select') {
    control = document.createElement('select');
    control.id = 'field-' + field.id;
    control.name = field.id;
    (field.options || []).forEach(function (opt) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.disabled) option.disabled = true;
      if (opt.selected) option.selected = true;
      control.appendChild(option);
    });
  } else if (field.type === 'textarea') {
    control = document.createElement('textarea');
    control.id = 'field-' + field.id;
    control.name = field.id;
    if (field.placeholder) control.placeholder = field.placeholder;
  } else if (field.type === 'checkbox') {
    const wrap = document.createElement('div');
    wrap.className = 'checkbox-group';
    control = document.createElement('input');
    control.type = 'checkbox';
    control.id = 'field-' + field.id;
    control.name = field.id;
    const checkLabel = document.createElement('label');
    checkLabel.htmlFor = 'field-' + field.id;
    checkLabel.appendChild(document.createTextNode(field.label + ' '));
    if (field.linkText && field.href) {
      const link = document.createElement('a');
      link.href = field.href;
      link.textContent = field.linkText;
      checkLabel.appendChild(link);
    }
    wrap.appendChild(control);
    wrap.appendChild(checkLabel);
    group.appendChild(wrap);
    appended = true;
  } else if (field.type === 'file') {
    group.appendChild(createFileUI(field));
    return group;
  } else {
    control = document.createElement('input');
    control.type = field.type === 'email' ? 'email' : 'text';
    control.id = 'field-' + field.id;
    control.name = field.id;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.autocomplete) control.autocomplete = field.autocomplete;
  }

  if (!appended) group.appendChild(control);
  wireValidation(field, control);
  return group;
}

function wireValidation(field, control) {
  const run = function () {
    const value = control.type === 'checkbox' ? control.checked : control.value;
    const msg = validateField(field, value);
    if (msg) showFieldError(field.id, msg);
    else clearFieldError(field.id);
  };
  const events = control.type === 'checkbox' || control.tagName === 'SELECT' ? ['change'] : ['blur', 'input'];
  events.forEach(function (ev) { control.addEventListener(ev, run); });
}

function validateField(field, value) {
  if (field.type === 'checkbox') {
    if (field.required && !value) return field.validation.errorMessage;
    return null;
  }
  const v = String(value).trim();
  if (field.required && !v) return field.validation.errorMessage;
  if (!v) return null;
  if (field.type === 'email' && !EMAIL_RE.test(v)) return field.validation.formatMessage;
  if (field.validation.minLength != null && v.length < field.validation.minLength) {
    return field.validation.errorMessage;
  }
  return null;
}

function createFileUI(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'file-upload-wrapper';

  const input = document.createElement('input');
  input.type = 'file';
  input.className = 'file-input-hidden';
  input.id = 'field-' + field.id;
  input.name = field.id;
  input.multiple = true;
  input.accept = state.config.allowedTypes.join(',');
  input.addEventListener('change', function () {
    addFiles(input.files);
    input.value = '';
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-upload-btn';
  button.textContent = 'Elegir archivos';
  button.addEventListener('click', function () { input.click(); });

  const list = document.createElement('ul');
  list.className = 'file-list';
  state.fileListEl = list;

  ['dragenter', 'dragover'].forEach(function (ev) {
    wrapper.addEventListener(ev, function (e) { e.preventDefault(); wrapper.classList.add('dragover'); });
  });
  wrapper.addEventListener('dragleave', function () { wrapper.classList.remove('dragover'); });
  wrapper.addEventListener('drop', function (e) {
    e.preventDefault();
    wrapper.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  wrapper.appendChild(button);
  wrapper.appendChild(input);
  wrapper.appendChild(list);
  return wrapper;
}

function addFiles(fileList) {
  const merged = state.files.concat(Array.prototype.slice.call(fileList));
  const err = validateFiles(merged, state.config);
  if (err) {
    showFieldError('attachments', err);
    return;
  }
  clearFieldError('attachments');
  state.files = merged;
  renderFileList();
}

function renderFileList() {
  const list = state.fileListEl;
  list.textContent = '';
  state.files.forEach(function (file, index) {
    const item = document.createElement('li');
    item.className = 'file-item';

    const info = document.createElement('span');
    info.className = 'file-item-info';
    info.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'file-item-size';
    size.textContent = formatBytes(file.size);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'file-item-remove';
    remove.textContent = '\u00d7';
    remove.setAttribute('aria-label', 'Quitar ' + file.name);
    remove.addEventListener('click', function () {
      state.files.splice(index, 1);
      clearFieldError('attachments');
      renderFileList();
    });

    item.appendChild(info);
    item.appendChild(size);
    item.appendChild(remove);
    list.appendChild(item);
  });
}

function validateFiles(files, config) {
  if (!files.length) return null;
  const maxFiles = config.fields.find(function (f) { return f.type === 'file'; }).maxFiles;
  if (files.length > maxFiles) return 'Puedes adjuntar hasta ' + maxFiles + ' archivos.';
  for (let i = 0; i < files.length; i++) {
    const lower = files[i].name.toLowerCase();
    if (!config.allowedTypes.some(function (ext) { return lower.endsWith(ext); })) {
      return 'El archivo "' + files[i].name + '" no tiene un formato permitido.';
    }
  }
  const total = files.reduce(function (sum, f) { return sum + f.size; }, 0);
  if (total > config.maxTotalBytes) {
    return 'Los archivos superan el límite total de ' + formatBytes(config.maxTotalBytes) + '.';
  }
  return null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  const mb = bytes / 1048576;
  return (mb % 1 === 0 ? mb : mb.toFixed(1)) + ' MB';
}

/* ---------- Puerta de envío (PR 5: submitForm() continúa aquí) ---------- */
function honeypotFilled() {
  const hp = el('field-website');
  return hp && hp.value.trim() !== '';
}

function cooldownActive() {
  return Date.now() - state.lastSubmitAt < COOLDOWN_MS;
}

function validateAll() {
  let firstInvalid = null;
  state.config.fields.forEach(function (field) {
    if (field.type === 'honeypot') return;
    const control = el('field-' + field.id);
    const value = control.type === 'checkbox' ? control.checked : control.value;
    const msg = validateField(field, value);
    if (msg) {
      showFieldError(field.id, msg);
      firstInvalid = firstInvalid || control;
    } else {
      clearFieldError(field.id);
    }
  });
  const fileErr = validateFiles(state.files, state.config);
  if (fileErr) {
    showFieldError('attachments', fileErr);
    firstInvalid = firstInvalid || el('field-attachments');
  } else {
    clearFieldError('attachments');
  }
  if (firstInvalid) firstInvalid.focus();
  return !!firstInvalid;
}

function handleSubmit(event) {
  event.preventDefault();
  if (honeypotFilled()) return; // bot: silencio total (PR 5 muestra éxito simulado)
  const msg = el('formMessage');
  msg.textContent = '';
  msg.className = 'form-message';
  if (cooldownActive()) {
    showMessage('Espera unos segundos antes de volver a enviar.', 'error');
    return;
  }
  if (validateAll()) {
    showMessage('Revisa los campos marcados en rojo.', 'error');
    return;
  }
  // PR 5: submitForm() envía el embed + archivos a state.config.webhook.url
}

loadConfig();