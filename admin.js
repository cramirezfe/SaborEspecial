(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const els = {
    menuForm: document.getElementById("menuForm"),
    menuSubmitButton: document.getElementById("menuSubmitButton"),
    menuFeedback: document.getElementById("menuFeedback"),
    menuTitleInput: document.getElementById("menuTitleInput"),
    menuDescriptionInput: document.getElementById("menuDescriptionInput"),
    menuPriceInput: document.getElementById("menuPriceInput"),
    adminUpdatedAt: document.getElementById("adminUpdatedAt"),
    currentMenuTitle: document.getElementById("currentMenuTitle"),
    currentMenuDescription: document.getElementById("currentMenuDescription"),
    currentMenuPrice: document.getElementById("currentMenuPrice"),
    currentAvailableMeals: document.getElementById("currentAvailableMeals"),
    currentSalesWindow: document.getElementById("currentSalesWindow"),
    currentDeliveryWindow: document.getElementById("currentDeliveryWindow")
  };

  let isSaving = false;

  function formatCurrency(amount) {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      maximumFractionDigits: 0
    }).format(Number(amount || 0));
  }

  function setMenuFeedback(message, isError) {
    els.menuFeedback.textContent = message || "";
    els.menuFeedback.style.color = isError ? "#842f3d" : "#705d52";
  }

  function formatDateTime(value) {
    if (!value) return "Sin datos recientes";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin datos recientes";
    return "Actualizado " + new Intl.DateTimeFormat("es-CR", {
      hour: "numeric",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    }).format(date);
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

  function renderSnapshot(snapshot) {
    const menu = snapshot.menu || {};
    els.adminUpdatedAt.textContent = formatDateTime(snapshot.updatedAt);
    els.currentMenuTitle.textContent = menu.title || "Menú no configurado";
    els.currentMenuDescription.textContent = menu.description || "No hay descripción disponible.";
    els.currentMenuPrice.textContent = formatCurrency(menu.price);
    els.currentAvailableMeals.textContent = String(snapshot.availableMeals || 0);
    els.currentSalesWindow.textContent = snapshot.salesWindow || "-";
    els.currentDeliveryWindow.textContent = snapshot.deliveryWindow || "-";

    if (!isSaving) {
      els.menuTitleInput.value = menu.title || "";
      els.menuDescriptionInput.value = menu.description || "";
      els.menuPriceInput.value = menu.price || "";
    }
  }

  async function refreshSnapshot() {
    try {
      const snapshot = await fetchJson("/dashboard");
      renderSnapshot(snapshot);
    } catch (error) {
      setMenuFeedback(error.message, true);
    }
  }

  function getMenuPayload() {
    const formData = new FormData(els.menuForm);
    return {
      adminSecret: String(formData.get("adminSecret") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      price: Number(formData.get("price") || 0)
    };
  }

  async function submitMenu(event) {
    event.preventDefault();

    if (isSaving) return;

    const payload = getMenuPayload();
    if (!payload.adminSecret || !payload.title || !payload.description || payload.price < 0) {
      setMenuFeedback("Complete la clave, el nombre, la descripcion y el precio.", true);
      return;
    }

    isSaving = true;
    els.menuSubmitButton.disabled = true;
    setMenuFeedback("Guardando menú del día...", false);

    try {
      const result = await fetchJson("/menu", {
        method: "POST",
        body: {
          adminSecret: payload.adminSecret,
          menu: {
            title: payload.title,
            description: payload.description,
            price: payload.price
          }
        }
      });

      setMenuFeedback(result.message || "Menú actualizado correctamente.", false);
      if (result.snapshot) {
        renderSnapshot(result.snapshot);
      } else {
        await refreshSnapshot();
      }
    } catch (error) {
      setMenuFeedback(error.message, true);
    } finally {
      isSaving = false;
      els.menuSubmitButton.disabled = false;
    }
  }

  function start() {
    els.menuForm.addEventListener("submit", submitMenu);
    refreshSnapshot();
  }

  start();
})();
