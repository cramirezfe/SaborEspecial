(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const SESSION_KEY = "ceep-role-session";
  const state = {
    snapshot: null,
    isSubmitting: false
  };

  const els = {
    menuTitle: document.getElementById("menuTitle"),
    menuDescription: document.getElementById("menuDescription"),
    menuPrice: document.getElementById("menuPrice"),
    dailyMessage: document.getElementById("dailyMessage"),
    availableCount: document.getElementById("availableCount"),
    soldCount: document.getElementById("soldCount"),
    sinpeCount: document.getElementById("sinpeCount"),
    cashCount: document.getElementById("cashCount"),
    totalAmount: document.getElementById("totalAmount"),
    buyersList: document.getElementById("buyersList"),
    orderForm: document.getElementById("orderForm"),
    submitButton: document.getElementById("submitButton"),
    formFeedback: document.getElementById("formFeedback"),
    paymentMethodInput: document.getElementById("paymentMethod"),
    paymentOptions: Array.from(document.querySelectorAll(".payment-option")),
    refreshButton: document.getElementById("refreshButton"),
    buyerRowTemplate: document.getElementById("buyerRowTemplate"),
    logoutButton: document.getElementById("logoutButton")
  };

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function requireCustomerSession() {
    const session = getSession();
    if (!session || session.role !== "CUSTOMER") {
      window.location.replace("./index.html");
      return false;
    }
    return true;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("./index.html");
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      maximumFractionDigits: 0
    }).format(Number(amount || 0));
  }

  function setFeedback(message, isError) {
    els.formFeedback.textContent = message || "";
    els.formFeedback.style.color = isError ? "#842f3d" : "#705d52";
  }

  function loadCachedSnapshot() {
    try {
      const raw = localStorage.getItem(config.cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveCachedSnapshot(snapshot) {
    try {
      localStorage.setItem(config.cacheKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("No se pudo guardar el cache local.", error);
    }
  }

  function renderBuyers(orders) {
    els.buyersList.innerHTML = "";

    if (!orders || orders.length === 0) {
      els.buyersList.innerHTML = '<p class="empty-state">No hay compras registradas todavía.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    orders.forEach((order) => {
      const node = els.buyerRowTemplate.content.cloneNode(true);
      node.querySelector(".buyer-name").textContent = order.buyerName;
      node.querySelector(".buyer-meta").textContent =
        [order.paymentMethod, order.paymentStatus, order.timestampLabel].filter(Boolean).join(" | ");

      const badge = node.querySelector(".buyer-payment");
      badge.textContent = order.paymentMethod;
      badge.className = order.paymentMethod === "SINPE" ? "badge badge--success buyer-payment" : "badge badge--warning buyer-payment";
      fragment.appendChild(node);
    });

    els.buyersList.appendChild(fragment);
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;

    const menu = snapshot.menu || {};
    els.menuTitle.textContent = menu.title || "Menú no configurado";
    els.menuDescription.textContent = menu.description || "No hay descripción disponible.";
    els.menuPrice.textContent = formatCurrency(menu.price);
    els.dailyMessage.textContent = snapshot.message || "Ofrecemos hasta 15 almuerzos diarios, según la asistencia de los niños y la disponibilidad autorizada por el MEP.";

    els.availableCount.textContent = String(snapshot.availableMeals || 0);
    els.soldCount.textContent = String(snapshot.soldMeals || 0);
    els.sinpeCount.textContent = String(snapshot.sinpeCount || 0);
    els.cashCount.textContent = String(snapshot.cashCount || 0);
    els.totalAmount.textContent = formatCurrency(snapshot.totalAmount || 0);

    renderBuyers(snapshot.orders || []);

    const canBuy = Boolean(snapshot.isSalesOpen) && Number(snapshot.availableMeals || 0) > 0;
    els.submitButton.disabled = !canBuy || state.isSubmitting;
    if (!canBuy) {
      setFeedback("La venta está cerrada o ya se alcanzó el máximo diario.", false);
    } else if (!state.isSubmitting) {
      setFeedback("", false);
    }
  }

  async function fetchJson(path, options) {
    if (!config.apiBaseUrl || config.apiBaseUrl.includes("PEGUE_AQUI")) {
      throw new Error("Debe configurar la URL del backend en config.js");
    }

    const requestOptions = {
      method: options && options.method ? options.method : "GET"
    };

    if (options && options.body) {
      requestOptions.headers = {
        "Content-Type": "application/json"
      };
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(config.apiBaseUrl + path, requestOptions);

    const payload = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      throw new Error((payload && payload.message) || "No fue posible completar la solicitud.");
    }

    return payload;
  }

  async function refreshSnapshot(showErrors) {
    try {
      const snapshot = await fetchJson("/dashboard");
      saveCachedSnapshot(snapshot);
      renderSnapshot(snapshot);
    } catch (error) {
      const cached = loadCachedSnapshot();
      if (cached) {
        renderSnapshot(cached);
      }
      if (showErrors) {
        setFeedback(error.message, true);
      }
    }
  }

  function getFormPayload() {
    const formData = new FormData(els.orderForm);
    return {
      buyerName: String(formData.get("buyerName") || "").trim(),
      paymentMethod: String(formData.get("paymentMethod") || "").trim()
    };
  }

  function selectPaymentMethod(method) {
    els.paymentMethodInput.value = method || "";
    els.paymentOptions.forEach(function (button) {
      const isSelected = button.dataset.paymentMethod === method;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  async function submitOrder(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const payload = getFormPayload();
    if (!payload.buyerName || !payload.paymentMethod) {
      setFeedback("Complete todos los campos obligatorios.", true);
      return;
    }

    state.isSubmitting = true;
    els.submitButton.disabled = true;
    setFeedback("Registrando compra...", false);

    try {
      const result = await fetchJson("/orders", {
        method: "POST",
        body: { order: payload }
      });

      if (!result.ok) {
        throw new Error(result.message || "No se pudo registrar la compra.");
      }

      els.orderForm.reset();
      selectPaymentMethod("");
      setFeedback(result.message || "Compra registrada correctamente.", false);
      if (result.snapshot) {
        saveCachedSnapshot(result.snapshot);
        renderSnapshot(result.snapshot);
      } else {
        await refreshSnapshot(false);
      }
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      state.isSubmitting = false;
      if (state.snapshot) {
        renderSnapshot(state.snapshot);
      } else {
        els.submitButton.disabled = false;
      }
    }
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        return null;
      });
    }
  }

  function start() {
    if (!requireCustomerSession()) return;

    const cached = loadCachedSnapshot();
    if (cached) {
      renderSnapshot(cached);
    }

    els.orderForm.addEventListener("submit", submitOrder);
    els.paymentOptions.forEach(function (button) {
      button.addEventListener("click", function () {
        selectPaymentMethod(button.dataset.paymentMethod);
      });
    });
    els.refreshButton.addEventListener("click", function () {
      refreshSnapshot(true);
    });
    if (els.logoutButton) {
      els.logoutButton.addEventListener("click", logout);
    }

    refreshSnapshot(false);
    window.setInterval(function () {
      refreshSnapshot(false);
    }, Number(config.refreshIntervalMs || 30000));

    registerServiceWorker();
  }

  start();
})();
