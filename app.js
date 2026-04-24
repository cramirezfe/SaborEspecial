(function () {
  "use strict";

  var config  = window.APP_CONFIG || {};
  var banner  = window.SE.banner;
  var fmt     = window.SE.fmt;
  var api     = window.SE.api.make(null);

  var slug = String(config.cafeteriaSlug || "ceep");

  // State
  var state = {
    snapshot:      null,
    weekMenus:     [],
    selectedDate:  "",   // YYYY-MM-DD the buyer has selected
    isSubmitting:  false
  };

  var els = {
    weekDayTabs:        document.getElementById("weekDayTabs"),
    menuDayEyebrow:     document.getElementById("menuDayEyebrow"),
    menuTitle:          document.getElementById("menuTitle"),
    menuDescription:    document.getElementById("menuDescription"),
    menuPrice:          document.getElementById("menuPrice"),
    dailyMessage:       document.getElementById("dailyMessage"),
    availableCount:     document.getElementById("availableCount"),
    buyersList:         document.getElementById("buyersList"),
    orderForm:          document.getElementById("orderForm"),
    submitButton:       document.getElementById("submitButton"),
    formFeedback:       document.getElementById("formFeedback"),
    paymentMethodInput: document.getElementById("paymentMethod"),
    paymentOptions:     Array.from(document.querySelectorAll(".payment-option")),
    buyerRowTemplate:   document.getElementById("buyerRowTemplate"),
    logoutButton:       document.getElementById("logoutButton"),
    trackingLinkSection:document.getElementById("trackingLinkSection"),
    trackingLink:       document.getElementById("trackingLink")
  };

  // ── Day key utilities (mirrors lib/dashboard.js) ──────────────────

  function todayKey() {
    return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  // ── Cache helpers ─────────────────────────────────────────────────

  function loadCached() {
    try { return JSON.parse(localStorage.getItem(config.cacheKey)); }
    catch (_) { return null; }
  }

  function saveCache(snapshot) {
    try { localStorage.setItem(config.cacheKey, JSON.stringify(snapshot)); }
    catch (_) {}
  }

  // ── Feedback ──────────────────────────────────────────────────────

  function setFeedback(message, isError) {
    els.formFeedback.textContent = message || "";
    els.formFeedback.style.color = isError ? "#842f3d" : "#705d52";
  }

  // ── Week day tabs ─────────────────────────────────────────────────

  function renderWeekTabs(weekMenus) {
    state.weekMenus = weekMenus || [];
    if (!els.weekDayTabs) return;
    if (!state.weekMenus.length) {
      els.weekDayTabs.innerHTML = '<span class="week-tab week-tab--loading">Sin datos</span>';
      return;
    }

    var html = "";
    state.weekMenus.forEach(function (day) {
      var isSelected   = day.date === state.selectedDate;
      var hasMenu      = Boolean(day.menu);
      var isOpen       = day.isOrderingOpen;
      var tabClass     = "week-tab" +
        (isSelected ? " is-active"  : "") +
        (!hasMenu   ? " is-no-menu" : "") +
        (!isOpen && hasMenu ? " is-closed" : "");

      html +=
        '<button type="button" class="' + tabClass + '" ' +
          'data-date="' + day.date + '" ' +
          'aria-selected="' + (isSelected ? "true" : "false") + '" ' +
          'role="tab" ' +
          (!hasMenu ? 'aria-disabled="true" ' : '') + '>' +
          '<span class="week-tab__day">' + day.dayLabel + (day.isToday ? ' <em>(hoy)</em>' : '') + '</span>' +
          '<span class="week-tab__status">' + (hasMenu ? (isOpen ? String(day.availableMeals) + ' disp.' : 'Cerrado') : 'No disponible') + '</span>' +
        '</button>';
    });
    els.weekDayTabs.innerHTML = html;

    els.weekDayTabs.querySelectorAll(".week-tab").forEach(function (btn) {
      if (btn.getAttribute("aria-disabled") === "true") return;
      btn.addEventListener("click", function () {
        selectDate(btn.dataset.date);
      });
    });
  }

  function selectDate(date) {
    state.selectedDate = date;

    // Refresh active state in the tab bar
    if (els.weekDayTabs) {
      els.weekDayTabs.querySelectorAll(".week-tab").forEach(function (btn) {
        var isActive = btn.dataset.date === date;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }

    // Find the day's data and render the menu card
    var day = state.weekMenus.find(function (d) { return d.date === date; });
    renderDayMenu(day);
  }

  function renderDayMenu(day) {
    if (!day) return;

    var menu = day.menu || null;

    // Eyebrow label: "Menú de hoy" vs "Menú del Mar 28 abr"
    if (els.menuDayEyebrow) {
      els.menuDayEyebrow.textContent = day.isToday
        ? "Menú de hoy"
        : "Menú del " + day.dayLabel;
    }

    if (menu) {
      els.menuTitle.textContent       = menu.title;
      els.menuDescription.textContent = menu.description || "No hay descripción disponible.";
      els.menuPrice.textContent       = fmt.currency(menu.price);
    } else {
      els.menuTitle.textContent       = "No disponible";
      els.menuDescription.textContent = "No hay menú programado para este día.";
      els.menuPrice.textContent       = "-";
    }

    els.availableCount.textContent = String(day.availableMeals || 0);

    var canBuy = day.isOrderingOpen && !state.isSubmitting;
    els.submitButton.disabled = !canBuy;

    if (!canBuy) {
      if (!menu) {
        setFeedback("No hay menú disponible para este día.", false);
      } else if (!day.isOrderingOpen) {
        setFeedback("La venta está cerrada o ya se alcanzó el máximo para este día.", false);
      }
    } else if (!state.isSubmitting) {
      setFeedback("", false);
    }

    // Show orders list for the selected date from the current snapshot
    if (state.snapshot) {
      renderBuyers(state.snapshot.orders || []);
    }
  }

  // ── Render buyers list ────────────────────────────────────────────

  function renderBuyers(orders) {
    els.buyersList.innerHTML = "";
    if (!orders || !orders.length) {
      els.buyersList.innerHTML = '<div class="delivery-table__empty">No hay compras registradas todavía.</div>';
      return;
    }

    var fragment = document.createDocumentFragment();
    orders.forEach(function (order) {
      var node     = els.buyerRowTemplate.content.cloneNode(true);
      var payLabel = fmt.paymentLabel(order.paymentStatus);

      node.querySelector(".buyer-name").textContent            = order.buyerName;
      node.querySelector(".buyer-meta").textContent            = [order.paymentMethod, payLabel, order.timestampLabel].filter(Boolean).join(" | ");
      node.querySelector(".customer-order-status").textContent = order.orderStatus || "SOLICITADO";
      node.querySelector(".customer-created-at").textContent   = order.createdAtLabel || order.timestampLabel || "";

      var payNode = node.querySelector(".customer-payment-status");
      payNode.textContent = payLabel;
      payNode.className   = fmt.paymentClass(order.paymentStatus) + " customer-payment-status";

      node.querySelector(".customer-payment-confirmed-at").textContent = order.paymentConfirmedAtLabel || "";

      var delivery  = order.deliveryStatus || "PENDIENTE_ENTREGA";
      var isDone    = delivery === "ENTREGADO" || delivery === "LISTO_PARA_ENTREGA";
      var badgeNode = node.querySelector(".customer-delivery-badge");
      var LABELS    = {
        ENTREGADO:          "Entregado",
        LISTO_PARA_ENTREGA: "Listo para Entrega",
        EN_PREPARACION:     "En Preparación",
        PENDIENTE_ENTREGA:  "Solicitado"
      };
      badgeNode.textContent = LABELS[delivery] || "Solicitado";
      badgeNode.className   = (isDone ? "delivery-action is-selected" : "delivery-action") + " customer-delivery-badge";

      node.querySelector(".customer-delivered-at").textContent = order.deliveredAtLabel || "";
      fragment.appendChild(node);
    });
    els.buyersList.appendChild(fragment);
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;
    if (els.dailyMessage) els.dailyMessage.textContent = snapshot.message || "";

    // Rebuild week tabs if weekly data is present
    if (snapshot.weekMenus && snapshot.weekMenus.length) {
      renderWeekTabs(snapshot.weekMenus);

      // On first load auto-select today (or first available day)
      if (!state.selectedDate) {
        var today = todayKey();
        var firstOpen = snapshot.weekMenus.find(function (d) { return d.isOrderingOpen; });
        var todayEntry = snapshot.weekMenus.find(function (d) { return d.date === today; });
        selectDate((todayEntry || firstOpen || snapshot.weekMenus[0]).date);
      } else {
        // Re-render the current day's card in case availability changed
        var current = snapshot.weekMenus.find(function (d) { return d.date === state.selectedDate; });
        if (current) renderDayMenu(current);
      }
    } else {
      // Fallback: single-day mode (no weekMenus in response)
      var menu = snapshot.menu || {};
      els.menuTitle.textContent       = menu.title       || "Menú no configurado";
      els.menuDescription.textContent = menu.description || "No hay descripción disponible.";
      els.menuPrice.textContent       = fmt.currency(menu.price);
      els.availableCount.textContent  = String(snapshot.availableMeals || 0);
      renderBuyers(snapshot.orders || []);

      var canBuy = Boolean(snapshot.isSalesOpen) && Number(snapshot.availableMeals || 0) > 0;
      els.submitButton.disabled = !canBuy || state.isSubmitting;
      if (!canBuy) setFeedback("La venta está cerrada o ya se alcanzó el máximo diario.", false);
      else if (!state.isSubmitting) setFeedback("", false);
    }
  }

  function showTrackingLink(trackingUrl) {
    if (!els.trackingLinkSection || !els.trackingLink) return;
    els.trackingLink.href        = trackingUrl;
    els.trackingLink.textContent = trackingUrl;
    els.trackingLinkSection.hidden = false;
  }

  // ── Optimistic UI ─────────────────────────────────────────────────

  function addOptimisticOrder(buyerName, paymentMethod) {
    var empty = els.buyersList.querySelector(".delivery-table__empty");
    if (empty) empty.remove();

    var fragment = els.buyerRowTemplate.content.cloneNode(true);
    var row = fragment.firstElementChild;
    if (row) row.dataset.optimistic = "true";

    fragment.querySelector(".buyer-name").textContent = buyerName;
    fragment.querySelector(".buyer-meta").textContent = [paymentMethod, "PENDIENTE DE PAGO", "Ahora"].join(" | ");
    fragment.querySelector(".customer-order-status").textContent = "SOLICITADO";
    fragment.querySelector(".customer-created-at").textContent = "Ahora";

    var payNode = fragment.querySelector(".customer-payment-status");
    payNode.textContent = "PENDIENTE DE PAGO";
    payNode.className = "delivery-payment-status customer-payment-status";

    fragment.querySelector(".customer-payment-confirmed-at").textContent = "";
    fragment.querySelector(".customer-delivery-badge").textContent = "Solicitado";
    fragment.querySelector(".customer-delivered-at").textContent = "";

    els.buyersList.insertBefore(fragment, els.buyersList.firstChild);
  }

  function removeOptimisticOrders() {
    els.buyersList.querySelectorAll("[data-optimistic]").forEach(function (el) { el.remove(); });
  }

  // ── Network ───────────────────────────────────────────────────────

  async function refreshSnapshot(showErrors) {
    try {
      var snapshot = await api.fetchJson("/dashboard?slug=" + encodeURIComponent(slug) + "&week=true");
      saveCache(snapshot);
      renderSnapshot(snapshot);
      banner.setSynced();
    } catch (err) {
      var cached = loadCached();
      if (cached) renderSnapshot(cached);
      if (!navigator.onLine) return;
      if (showErrors) {
        setFeedback(err.message, true);
        banner.setError(function () { refreshSnapshot(true); });
      }
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (state.isSubmitting) return;

    var fd      = new FormData(els.orderForm);
    var payload = {
      buyerName:     String(fd.get("buyerName")    || "").trim(),
      buyerEmail:    String(fd.get("buyerEmail")   || "").trim().toLowerCase(),
      paymentMethod: String(fd.get("paymentMethod") || "").trim(),
      targetDate:    state.selectedDate || todayKey()
    };

    if (!payload.buyerName || !payload.paymentMethod) {
      setFeedback("Complete todos los campos obligatorios.", true);
      return;
    }

    state.isSubmitting        = true;
    els.submitButton.disabled = true;
    banner.setSyncing();

    var prevAvailable = Number(els.availableCount.textContent) || 0;
    els.orderForm.reset();
    selectPaymentMethod("");
    setFeedback("Compra registrada correctamente.", false);
    addOptimisticOrder(payload.buyerName, payload.paymentMethod);
    if (prevAvailable > 0) els.availableCount.textContent = String(prevAvailable - 1);

    try {
      var result = await api.fetchJson("/orders?slug=" + encodeURIComponent(slug), {
        method: "POST",
        body:   { order: payload }
      });

      if (!result.ok) throw new Error(result.message || "No se pudo registrar la compra.");

      if (result.trackingToken) {
        var trackingUrl = window.location.origin +
          window.location.pathname.replace(/[^/]*$/, "") +
          "track.html?token=" + encodeURIComponent(result.trackingToken);
        showTrackingLink(trackingUrl);
      }

      // Refresh to get the updated week view including the new order
      await refreshSnapshot(false);
      setFeedback(result.message || "Compra registrada correctamente.", false);
      banner.setSynced();
    } catch (err) {
      removeOptimisticOrders();
      els.availableCount.textContent = String(prevAvailable);
      setFeedback(err.message, true);
      banner.setError(null);
    } finally {
      state.isSubmitting = false;
      // Re-evaluate button state from the current selected day
      var day = state.weekMenus.find(function (d) { return d.date === state.selectedDate; });
      els.submitButton.disabled = !(day && day.isOrderingOpen);
    }
  }

  function selectPaymentMethod(method) {
    els.paymentMethodInput.value = method || "";
    els.paymentOptions.forEach(function (btn) {
      var sel = btn.dataset.paymentMethod === method;
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-pressed", sel ? "true" : "false");
    });
  }

  // ── Init ──────────────────────────────────────────────────────────

  function start() {
    var cached = loadCached();
    if (cached) renderSnapshot(cached);

    els.orderForm.addEventListener("submit", submitOrder);
    els.paymentOptions.forEach(function (btn) {
      btn.addEventListener("click", function () { selectPaymentMethod(btn.dataset.paymentMethod); });
    });
    if (els.logoutButton) {
      els.logoutButton.addEventListener("click", function () {
        sessionStorage.removeItem("ceep-role-session");
        window.location.replace("./index.html");
      });
    }

    banner.init();
    refreshSnapshot(false);

    window.setInterval(function () { refreshSnapshot(false); }, Number(config.refreshIntervalMs || 30000));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  start();
})();
