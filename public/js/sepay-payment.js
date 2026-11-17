(function () {
  'use strict';

  function startPolling() {
    var box = document.querySelector('[data-sepay-poll]');
    if (!box) return;

    var statusUrl = box.getAttribute('data-status-url');
    var successModal = document.querySelector('[data-sepay-success-modal]');
    var goOrders = successModal && successModal.querySelector('[data-sepay-go-orders]');
    var redirectTimer = null;

    function goToOrders() {
      if (redirectTimer) window.clearTimeout(redirectTimer);
      window.location.assign(ordersUrl);
    }

    function openSuccessModal() {
      if (!successModal) {
        redirectTimer = window.setTimeout(goToOrders, 2000);
        return;
      }
      successModal.hidden = false;
      successModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('payment-modal-open');
      if (goOrders) goOrders.focus();
      redirectTimer = window.setTimeout(goToOrders, 3000);
    }

    if (goOrders) goOrders.addEventListener('click', goToOrders);
    if (successModal) {
      var close = successModal.querySelector('[data-sepay-modal-close]');
      if (close) close.addEventListener('click', goToOrders);
    }
    var ordersUrl = box.getAttribute('data-orders-url') || '/orders';
    var stopped = false;
    var timer = null;

    function show(message, type) {
      box.textContent = message;
      box.className = 'notice ' + (type || 'info');
    }

    function schedule(ms) {
      if (!stopped) timer = window.setTimeout(check, ms);
    }

    function check() {
      if (stopped) return;
      fetch(statusUrl, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error('Invalid status response');

          if (data.status === 'PAID' || data.paid === true) {
            stopped = true;
            show('Thanh toán thành công.', 'ok');
            openSuccessModal();
            return;
          }

          if (data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'REFUNDED') {
            stopped = true;
            show('Giao dịch đang ở trạng thái ' + data.status + '. Bạn có thể quay lại đơn hàng để thử lại.', 'warn');
            return;
          }

          show('Đang chờ xác nhận thanh toán...');
          schedule(2000);
        })
        .catch(function () {
          // Lỗi mạng tạm thời không làm dừng việc kiểm tra.
          schedule(3000);
        });
    }

    check();
    window.addEventListener('beforeunload', function () {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPolling);
  } else {
    startPolling();
  }
}());
