/* Mã chạy trên trình duyệt. Không có script nội tuyến (CSP chỉ cho phép file cùng nguồn).
   Trang vẫn dùng được khi tắt JavaScript: mọi biểu mẫu gửi theo cách thông thường. */
(function () {
  'use strict';
  var doc = document;
  doc.documentElement.classList.add('js');

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function vnd(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '₫'; }

  /* ---------- Ảnh lỗi: thay bằng ảnh minh họa, ảnh phụ thì ẩn đi ---------- */
  var PLACEHOLDER = '/images/placeholder.svg';
  doc.addEventListener('error', function (e) {
    var img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.hasAttribute('data-optional')) {
      var holder = img.closest('[data-optional-holder]');
      (holder || img).hidden = true;
      return;
    }
    if (img.getAttribute('src') !== PLACEHOLDER && !img.dataset.fallbackDone) {
      img.dataset.fallbackDone = '1';
      img.src = PLACEHOLDER;
    }
  }, true);
  $all('img').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) img.dispatchEvent(new Event('error'));
  });

  /* ---------- Menu trên điện thoại ---------- */
  var navToggle = $('.nav-toggle');
  var nav = doc.getElementById('primary-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- Bộ lọc thu gọn trên điện thoại ---------- */
  var filterToggle = $('.filters-toggle');
  var filterBox = $('.filters-collapsible');
  if (filterToggle && filterBox) {
    filterToggle.addEventListener('click', function () {
      var open = filterBox.classList.toggle('open');
      filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- Hỏi xác nhận trước khi gửi (form hoặc nút có data-confirm) ---------- */
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    var btn = e.submitter;
    var msg = (btn && btn.getAttribute('data-confirm')) || (form.getAttribute && form.getAttribute('data-confirm'));
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  /* ---------- Ô chọn tự gửi biểu mẫu khi đổi ---------- */
  $all('select[data-autosubmit]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var f = sel.form;
      if (f) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
    });
  });

  /* ---------- Ô số lượng có nút tăng giảm ---------- */
  $all('[data-qty]').forEach(function (box) {
    var input = $('input', box);
    if (!input) return;
    var auto = box.hasAttribute('data-submit-on-change');
    var timer = null;
    function clamp() {
      var min = parseInt(input.min, 10) || 1;
      var max = parseInt(input.max, 10) || 99;
      var v = parseInt(input.value, 10);
      if (isNaN(v)) v = min;
      input.value = Math.min(max, Math.max(min, v));
    }
    function changed() {
      clamp();
      if (auto && input.form) {
        clearTimeout(timer);
        timer = setTimeout(function () { if (input.form.requestSubmit) input.form.requestSubmit(); else input.form.submit(); }, 500);
      }
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      input.value = (parseInt(input.value, 10) || 0) + parseInt(b.getAttribute('data-step'), 10);
      changed();
    });
    input.addEventListener('change', changed);
  });

  /* ---------- Thư viện ảnh sản phẩm ---------- */
  var thumbs = $all('[data-thumb]');
  thumbs.forEach(function (b) {
    b.addEventListener('click', function () {
      var main = doc.getElementById('gallery-main');
      if (!main) return;
      main.dataset.fallbackDone = '';
      main.src = b.getAttribute('data-src');
      main.alt = b.getAttribute('data-alt') || '';
      thumbs.forEach(function (x) { x.classList.toggle('is-active', x === b); });
    });
  });

  /* ---------- Chọn màu và size ở trang chi tiết: giá, SKU, tồn kho cập nhật theo biến thể ---------- */
  var dataEl = doc.getElementById('variant-data');
  var buyForm = doc.getElementById('buy-form');
  if (dataEl && buyForm) {
    var variants = [];
    try { variants = JSON.parse(dataEl.textContent || '[]'); } catch (err) { variants = []; }
    var LOW = parseInt(buyForm.getAttribute('data-low'), 10) || 3;
    var MAXQ = parseInt(buyForm.getAttribute('data-maxqty'), 10) || 20;
    var hidden = doc.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'variantId';
    buyForm.appendChild(hidden);

    var priceEl = doc.getElementById('pdp-price');
    var cmpEl = doc.getElementById('pdp-compare');
    var offEl = doc.getElementById('pdp-off');
    var skuEl = doc.getElementById('pdp-sku');
    var stockEl = doc.getElementById('pdp-stock');
    var colorEl = doc.getElementById('color-name');
    var btn = doc.getElementById('add-to-cart');
    var hint = doc.getElementById('pick-hint');
    var qty = $('input[name="quantity"]', buyForm);

    var find = function (color, size) {
      for (var i = 0; i < variants.length; i += 1) {
        if (variants[i].color === color && variants[i].size === size) return variants[i];
      }
      return null;
    };
    var checkedValue = function (name) {
      var r = $('input[name="' + name + '"]:checked', buyForm);
      return r ? r.value : '';
    };

    var paintSizes = function (color) {
      $all('.size-cell', buyForm).forEach(function (cell) {
        var input = $('input', cell);
        var label = $('small', cell);
        var v = find(color, input.value);
        var stock = v ? v.stock : 0;
        input.disabled = stock <= 0;
        cell.classList.toggle('is-out', stock <= 0);
        label.textContent = !v ? 'Không có' : (stock > 0 ? 'Còn ' + stock : 'Hết hàng');
        if (input.disabled && input.checked) input.checked = false;
      });
    };

    var setStock = function (text, cls) {
      if (!stockEl) return;
      stockEl.textContent = text;
      stockEl.className = 'stock-line' + (cls ? ' ' + cls : '');
    };

    var refresh = function () {
      var color = checkedValue('color');
      var size = checkedValue('size');
      if (colorEl) colorEl.textContent = color;
      var v = color && size ? find(color, size) : null;

      if (v) {
        hidden.value = String(v.id);
        if (priceEl) priceEl.textContent = vnd(v.price);
        var onSale = v.compareAt && v.compareAt > v.price;
        if (cmpEl) { cmpEl.hidden = !onSale; if (onSale) cmpEl.textContent = vnd(v.compareAt); }
        if (offEl) { offEl.hidden = !onSale; if (onSale) offEl.textContent = '-' + Math.round((v.compareAt - v.price) * 100 / v.compareAt) + '%'; }
        if (skuEl) skuEl.textContent = v.sku;
        if (v.stock <= 0) setStock('Biến thể này đã hết hàng.', 'out');
        else if (v.stock <= LOW) setStock('Sắp hết hàng, chỉ còn ' + v.stock + ' sản phẩm.', 'low');
        else setStock('Còn ' + v.stock + ' sản phẩm trong kho.', 'ok');
        if (qty) {
          qty.max = String(Math.max(1, Math.min(MAXQ, v.stock)));
          if (parseInt(qty.value, 10) > parseInt(qty.max, 10)) qty.value = qty.max;
        }
      } else {
        hidden.value = '';
        var prices = variants.filter(function (x) { return x.color === color; }).map(function (x) { return x.price; });
        if (priceEl && prices.length) {
          var lo = Math.min.apply(null, prices);
          var hi = Math.max.apply(null, prices);
          priceEl.textContent = (lo === hi ? '' : 'Từ ') + vnd(lo);
        }
        if (cmpEl) cmpEl.hidden = true;
        if (offEl) offEl.hidden = true;
        if (skuEl) skuEl.textContent = '';
        setStock('Chọn kích cỡ để xem số lượng còn lại.', '');
      }

      var canBuy = Boolean(v && v.stock > 0);
      if (btn) btn.disabled = !canBuy;
      if (hint) hint.textContent = canBuy ? '' : (v ? 'Biến thể này đã hết hàng.' : 'Chọn kích cỡ để thêm vào giỏ hàng.');
    };

    buyForm.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'color') paintSizes(e.target.value);
      refresh();
    });
    paintSizes(checkedValue('color'));
    refresh();
  }

  /* ---------- Kiểm tra mã giảm giá ở trang đặt hàng ---------- */
  var applyBtn = doc.getElementById('discount-apply');
  if (applyBtn) {
    var codeInput = doc.getElementById('discountCode');
    var msg = doc.getElementById('discount-msg');
    var row = doc.getElementById('sum-discount-row');
    var sumDiscount = doc.getElementById('sum-discount');
    var sumShip = doc.getElementById('sum-shipping');
    var sumTotal = doc.getElementById('sum-total');
    var token = applyBtn.form ? $('input[name="csrfToken"]', applyBtn.form) : null;

    var show = function (text, ok) {
      msg.textContent = text;
      msg.className = 'field-msg ' + (ok ? 'ok' : 'error');
    };
    var reset = function () {
      if (row) row.hidden = true;
      if (sumShip) sumShip.textContent = sumShip.getAttribute('data-default');
      if (sumTotal) sumTotal.textContent = sumTotal.getAttribute('data-default');
    };

    applyBtn.addEventListener('click', function () {
      var code = codeInput.value.trim();
      if (!code) { show('Vui lòng nhập mã giảm giá.', false); reset(); return; }
      var body = new URLSearchParams();
      body.set('discountCode', code);
      body.set('csrfToken', token ? token.value : '');
      applyBtn.disabled = true;
      fetch('/checkout/apply-discount', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            show(d.message, true);
            if (row) row.hidden = false;
            if (sumDiscount) sumDiscount.textContent = d.labels.discount;
            if (sumShip) sumShip.textContent = d.labels.shippingFee;
            if (sumTotal) sumTotal.textContent = d.labels.total;
          } else {
            show((d && (d.message || d.error)) || 'Mã giảm giá không áp dụng được.', false);
            reset();
          }
        })
        .catch(function () {
          show('Chưa kiểm tra được mã lúc này. Mã sẽ được kiểm tra lại khi bạn đặt hàng.', false);
        })
        .then(function () { applyBtn.disabled = false; });
    });
  }

  /* ---------- Quản trị: tự tạo đường dẫn (slug) từ tên khi chưa tự sửa ---------- */
  var slugSource = $('[data-slug-from]');
  if (slugSource) {
    var slugField = doc.getElementById(slugSource.getAttribute('data-slug-from'));
    if (slugField) {
      var auto = !slugField.value;
      slugField.addEventListener('input', function () { auto = false; });
      slugSource.addEventListener('input', function () {
        if (!auto) return;
        slugField.value = slugSource.value
          .replace(/đ/g, 'd').replace(/Đ/g, 'D')
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      });
    }
  }
}());
