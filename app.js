(function () {
  "use strict";

  var config  = window.APP_CONFIG || {};
  var banner  = window.SE.banner;
  var fmt     = window.SE.fmt;
  // Public endpoints don't send a Bearer token.
  var api     = window.SE.api.make(null);

  var slug    = String(config.cafeteriaSlug || "ceep");
  var state   = { snapshot: null, isSubmitting: false };

  var els = {
    menuTitle:         document.getElementById("menuTitle"),
    menuDescription:   document.getElementById("menuDescription"),
    menuPrice:         document.getElementById("menuPrice"),
    dailyMessage:      document.getElementById("dailyMessage"),
    availableCount:    document.getElementById("availableCount"),
    buyersList:        document.getElementById("buyersList"),
    orderForm:         document.getElementById("orderForm"),
    submitButton:      document.getElementById("submitButton"),
    formFeedback:      document.getElementById("formFeedback"),
    paymentMethodInput:document.getElementById("paymentMethod"),
    paymentOptions:    Array.from(document.querySelectorAll(".payment-option")),
    buyerRowTemplate:  document.getElementById("buyerRowTemplate"),
    logoutButton:      document.getElementById("logoutButton"),
    trackingLinkSection:document.getElementById("trackingLinkSection"),
    trackingLink:      document.getElementById("trackingLink")
  };

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

  // ── Render ────────────────────────────────────────────────────────

  function renderBuyers(orders) {
    els.buyersList.innerHTML = "";
    if (!orders || !orders.length) {
      els.buyersList.innerHTML = '<div class="delivery-table__empty">No hay compras registradas todavía.</div>';
      return;
    }

    var fragment = document.createDocumentFragment();
    orders.forEach(function (order) {
      var node       = els.buyerRowTemplate.content.cloneNode(true);
      var payLabel   = fmt.paymentLabel(order.paymentStatus);

      node.querySelector(".buyer-name").textContent           = order.buyerName;
      node.querySelector(".buyer-meta").textContent           = [order.paymentMethod, payLabel, order.timestampLabel].filter(Boolean).join(" | ");
      node.querySelector(".customer-order-status").textContent= order.orderStatus || "SOLICITADO";
      node.querySelector(".customer-created-at").textContent  = order.createdAtLabel || order.timestampLabel || "";

      var payNode = node.querySelector(".customer-payment-status");
      payNode.textContent = payLabel;
      payNode.className   = fmt.paymentClass(order.paymentStatus) + " customer-payment-status";

      node.querySelector(".customer-payment-confirmed-at").textContent = order.paymentConfirmedAtLabel || "";

      var delivery = order.deliveryStatus || "PENDIENTE_ENTREGA";
      var isDone   = delivery === "ENTREGADO" || delivery === "LISTO_PARA_ENTREGA";
      var badgeNode = node.querySelector(".customer-delivery-badge");
      var LABELS    = { ENTREGADO: "Entregado", LISTO_PARA_ENTREGA: "Listo para Entrega", EN_PREPARACION: "En Preparación", PENDIENTE_ENTREGA: "Solicitado" };
      badgeNode.textContent = LABELS[delivery] || "Solicitado";
      badgeNode.className   = (isDone ? "delivery-action is-selected" : "delivery-action") + " customer-delivery-badge";

      node.querySelector(".customer-delivered-at").textContent = order.deliveredAtLabel || "";
      fragment.appendChild(node);
    });
    els.buyersList.appendChild(fragment);
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;
    var menu = snapshot.menu || {};
    els.menuTitle.textContent       = menu.title       || "Menú no configurado";
    els.menuDescription.textContent = menu.description || "No hay descripción disponible.";
    els.menuPrice.textContent       = fmt.currency(menu.price);
    els.dailyMessage.textContent    = snapshot.message || "";
    els.availableCount.textContent  = String(snapshot.availableMeals || 0);
    renderBuyers(snapshot.orders || []);

    var canBuy = Boolean(snapshot.isSalesOpen) && Number(snapshot.availableMeals || 0) > 0;
    els.submitButton.disabled = !canBuy || state.isSubmitting;
    if (!canBuy) setFeedback("La venta está cerrada o ya se alcanzó el máximo diario.", false);
    else if (!state.isSubmitting) setFeedback("", false);
  }

  function showTrackingLink(trackingUrl) {
    if (!els.trackingLinkSection || !els.trackingLink) return;
    els.trackingLink.href        = trackingUrl;
    els.trackingLink.textContent = trackingUrl;
    els.trackingLinkSection.hidden = false;
  }

  // ── Optimistic UI helpers ─────────────────────────────────────────

  function addOptimisticOrder(buyerName, paymentMethod) {
    var empty = els.buyersList.querySelector(".delivery-table__empty");
    if (empty) empty.remove();

    var fragment = els.buyerRowTemplate.content.cloneNode(true);
    var row = fragment.firstElementChild;
    row.dataset.optimistic = "true";

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
      var snapshot = await api.fetchJson("/dashboard?slug=" + encodeURIComponent(slug));
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
      buyerName:     String(fd.get("buyerName")     || "").trim(),
      buyerEmail:    String(fd.get("buyerEmail")     || "").trim().toLowerCase(),
      paymentMethod: String(fd.get("paymentMethod")  || "").trim()
    };

    if (!payload.buyerName || !payload.paymentMethod) {
      setFeedback("Complete todos los campos obligatorios.", true);
      return;
    }

    state.isSubmitting        = true;
    els.submitButton.disabled = true;
    banner.setSyncing();

    // Optimistic UI: give instant feedback before the server responds.
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

      // Replace optimistic row with confirmed server data.
      if (result.snapshot) { saveCache(result.snapshot); renderSnapshot(result.snapshot); }
      else                 { await refreshSnapshot(false); }
      setFeedback(result.message || "Compra registrada correctamente.", false);
      banner.setSynced();
    } catch (err) {
      // Rollback: undo optimistic changes and surface the error.
      removeOptimisticOrders();
      els.availableCount.textContent = String(prevAvailable);
      setFeedback(err.message, true);
      banner.setError(null);
    } finally {
      state.isSubmitting = false;
      // Re-evaluate button state from the snapshot without re-rendering the full UI.
      if (state.snapshot) {
        var canBuy = Boolean(state.snapshot.isSalesOpen) && Number(state.snapshot.availableMeals || 0) > 0;
        els.submitButton.disabled = !canBuy;
      } else {
        els.submitButton.disabled = false;
      }
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

    // Polling keeps the count fresh on slow/spotty connections.
    // The interval is intentionally kept at 30 s here because the customer
    // page has no Realtime connection (no Supabase auth in this view).
    window.setInterval(function () { refreshSnapshot(false); }, Number(config.refreshIntervalMs || 30000));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  start();
})();
