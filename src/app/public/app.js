// PayFlow Client Application Logic

(function () {
  'use strict';

  // In-memory API key for current page session
  let memoryApiKey = '';

  // DOM Elements
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleApiKeyBtn = document.getElementById('toggleApiKeyVisibility');
  const authStatusBadge = document.getElementById('authStatusBadge');
  const alertContainer = document.getElementById('alertContainer');
  const paymentForm = document.getElementById('paymentForm');
  const recipientInput = document.getElementById('recipientInput');
  const currencySelect = document.getElementById('currencySelect');
  const amountInput = document.getElementById('amountInput');
  const idempotencyKeyInput = document.getElementById('idempotencyKeyInput');
  const generateIdempBtn = document.getElementById('generateIdempBtn');
  const submitBtn = document.getElementById('submitPaymentBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const transactionsTableBody = document.getElementById('transactionsTableBody');
  const transactionCountBadge = document.getElementById('transactionCountBadge');
  const recipientError = document.getElementById('recipientError');
  const amountError = document.getElementById('amountError');

  /**
   * Converts a decimal monetary string into integer minor units without floating-point math.
   * Example: "10.50" -> 1050, "5" -> 500, "0.99" -> 99.
   */
  function parseDecimalToMinorUnits(valueStr) {
    if (!valueStr || typeof valueStr !== 'string') {
      throw new Error('Please enter a payment amount.');
    }
    const trimmed = valueStr.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      throw new Error('Amount must be a positive number with at most 2 decimal places (e.g. 10.50).');
    }
    const parts = trimmed.split('.');
    const whole = parseInt(parts[0], 10);
    const fracStr = parts[1] || '';
    const frac = parseInt(fracStr.padEnd(2, '0'), 10);
    const totalMinor = whole * 100 + frac;

    if (totalMinor <= 0) {
      throw new Error('Amount must be strictly greater than zero.');
    }
    return totalMinor;
  }

  /**
   * Formats integer minor units into a human-readable decimal string without floating point operations.
   * Example: 1050 -> "10.50", 500 -> "5.00", 99 -> "0.99".
   */
  function formatMinorUnits(minorUnits) {
    if (typeof minorUnits !== 'number' || isNaN(minorUnits)) {
      return '0.00';
    }
    const whole = Math.floor(minorUnits / 100);
    const frac = (minorUnits % 100).toString().padStart(2, '0');
    return `${whole}.${frac}`;
  }

  /**
   * Displays an alert notification banner.
   */
  function showAlert(message, type = 'error') {
    alertContainer.innerHTML = '';
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.setAttribute('role', 'alert');

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-close';
    closeBtn.setAttribute('aria-label', 'Close alert');
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = function () {
      alertContainer.innerHTML = '';
    };

    alertDiv.appendChild(messageSpan);
    alertDiv.appendChild(closeBtn);
    alertContainer.appendChild(alertDiv);
  }

  function clearAlert() {
    alertContainer.innerHTML = '';
  }

  function clearFieldErrors() {
    recipientError.textContent = '';
    amountError.textContent = '';
  }

  /**
   * Updates API key authentication state in page memory.
   */
  function updateAuthKey() {
    memoryApiKey = apiKeyInput.value.trim();
    if (memoryApiKey.length > 0) {
      authStatusBadge.className = 'badge badge-success';
      authStatusBadge.textContent = 'Configured';
    } else {
      authStatusBadge.className = 'badge badge-warning';
      authStatusBadge.textContent = 'Key Not Set';
    }
  }

  apiKeyInput.addEventListener('input', function () {
    updateAuthKey();
    clearAlert();
  });

  toggleApiKeyBtn.addEventListener('click', function () {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = 'Show';
    }
  });

  generateIdempBtn.addEventListener('click', function () {
    const randomHex = Math.random().toString(36).substring(2, 10);
    idempotencyKeyInput.value = `idemp_${Date.now()}_${randomHex}`;
  });

  /**
   * Fetches and renders transaction history.
   */
  async function loadTransactions() {
    if (!memoryApiKey) {
      renderTablePlaceholder('Please configure an API key in the header to view transactions.');
      return;
    }

    try {
      const response = await fetch('/api/payments', {
        headers: {
          'x-api-key': memoryApiKey,
        },
      });

      if (response.status === 401) {
        authStatusBadge.className = 'badge badge-warning';
        authStatusBadge.textContent = 'Invalid Key';
        showAlert('Authentication failed: The provided API key is invalid or unauthorized.', 'error');
        renderTablePlaceholder('Authentication required. Enter a valid API key.');
        return;
      }

      if (!response.ok) {
        showAlert(`Failed to load transactions (Status ${response.status}).`, 'error');
        return;
      }

      const body = await response.json();
      const transactions = body.data || [];
      renderTransactions(transactions);
    } catch (err) {
      showAlert('Network error while connecting to PayFlow server.', 'error');
    }
  }

  function renderTablePlaceholder(message) {
    transactionsTableBody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="6" class="empty-state">${escapeHtml(message)}</td>
      </tr>
    `;
    transactionCountBadge.textContent = '0 items';
  }

  function renderTransactions(transactions) {
    transactionCountBadge.textContent = `${transactions.length} items`;

    if (transactions.length === 0) {
      renderTablePlaceholder('No transactions recorded yet.');
      return;
    }

    const rowsHtml = transactions
      .map(function (txn) {
        const formattedAmount = formatMinorUnits(txn.amountMinor);
        const statusClass = txn.status === 'COMPLETED' ? 'status-completed' : 'status-failed';
        const dateFormatted = txn.createdAt ? new Date(txn.createdAt).toLocaleString() : '-';

        return `
          <tr data-testid="transaction-row" data-transaction-id="${escapeHtml(txn.id)}">
            <td class="txn-id-cell" title="${escapeHtml(txn.id)}">${escapeHtml(txn.id)}</td>
            <td>${escapeHtml(txn.recipient)}</td>
            <td><strong>${formattedAmount}</strong></td>
            <td>${escapeHtml(txn.currency)}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(txn.status)}</span></td>
            <td>${escapeHtml(dateFormatted)}</td>
          </tr>
        `;
      })
      .join('');

    transactionsTableBody.innerHTML = rowsHtml;
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  refreshBtn.addEventListener('click', function () {
    clearAlert();
    loadTransactions();
  });

  /**
   * Payment form submission handler.
   */
  paymentForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearAlert();
    clearFieldErrors();

    // 1. Client-side validation: API key check
    if (!memoryApiKey) {
      showAlert('API Key is missing. Please set your API key in the top header before submitting payments.', 'warning');
      apiKeyInput.focus();
      return;
    }

    // 2. Client-side validation: Recipient
    const recipient = recipientInput.value.trim();
    if (!recipient) {
      recipientError.textContent = 'Recipient is required.';
      recipientInput.focus();
      return;
    }

    // 3. Client-side validation: Currency
    const currency = currencySelect.value;
    if (!currency) {
      showAlert('Please select a valid currency.', 'error');
      return;
    }

    // 4. Client-side validation: Amount (integer minor units without floats)
    let amountMinor;
    try {
      amountMinor = parseDecimalToMinorUnits(amountInput.value);
    } catch (err) {
      amountError.textContent = err.message;
      amountInput.focus();
      return;
    }

    // 5. Submit to REST API
    const idempotencyKey = idempotencyKeyInput.value.trim() || undefined;
    const payload = {
      recipient: recipient,
      currency: currency,
      amountMinor: amountMinor,
    };
    if (idempotencyKey) {
      payload.idempotencyKey = idempotencyKey;
    }

    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    const originalText = btnText.textContent;
    btnText.textContent = 'Processing...';

    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': memoryApiKey,
      };
      if (idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 201) {
        showAlert(`Payment successful! Transaction ID: ${data.data.id}`, 'success');
        paymentForm.reset();
        await loadTransactions();
      } else if (response.status === 200) {
        showAlert(`Idempotent Replay: Payment was already processed. Transaction ID: ${data.data.id}`, 'warning');
        await loadTransactions();
      } else if (response.status === 401) {
        authStatusBadge.className = 'badge badge-warning';
        authStatusBadge.textContent = 'Invalid Key';
        showAlert('Authentication failed: Provided API key was rejected by the server.', 'error');
      } else if (response.status === 409) {
        showAlert(`Conflict: ${data.error.message || 'Idempotency key was reused with different payment parameters.'}`, 'error');
      } else if (response.status === 422) {
        showAlert(`Validation Error: ${data.error.message}`, 'error');
      } else {
        showAlert(`Error: ${data.error ? data.error.message : 'An unexpected error occurred.'}`, 'error');
      }
    } catch (err) {
      showAlert('Network error: Unable to submit payment request.', 'error');
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = originalText;
    }
  });

  // Expose monetary parser for test verification if running in test environment
  if (typeof window !== 'undefined') {
    window.PayFlowUtils = {
      parseDecimalToMinorUnits: parseDecimalToMinorUnits,
      formatMinorUnits: formatMinorUnits,
    };
  }
})();
