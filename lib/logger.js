// Browser-side error capture. Include this script before app.js.
// Sends uncaught errors to the Supabase error_logs table using the anon key
// (INSERT-only RLS policy). Never throws; never blocks the main application.
(function () {
  "use strict";

  // Hard cap per page session so a cascading error storm doesn't flood the table.
  var MAX_ERRORS = 5;
  var errorCount = 0;

  function send(message, stack) {
    if (errorCount >= MAX_ERRORS) return;
    errorCount++;

    var config = window.APP_CONFIG || {};
    var baseUrl = config.supabaseUrl;
    var anonKey = config.supabaseAnonKey;

    // Skip if Supabase isn't configured yet (dev placeholder values).
    if (!baseUrl || !anonKey || baseUrl.indexOf("REPLACE") !== -1) return;

    var payload = JSON.stringify({
      page_url:    window.location.href.slice(0, 500),
      message:     String(message || "").slice(0, 1000),
      stack:       String(stack   || "").slice(0, 3000),
      user_agent:  navigator.userAgent.slice(0, 500),
      occurred_at: new Date().toISOString()
    });

    // keepalive ensures delivery even when the user navigates away immediately.
    fetch(baseUrl.replace(/\/$/, "") + "/rest/v1/error_logs", {
      method:    "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "apikey":        anonKey,
        "Authorization": "Bearer " + anonKey,
        "Prefer":        "return=minimal"
      },
      body: payload
    }).catch(function () {}); // network errors are silently discarded
  }

  // Capture synchronous exceptions.
  window.addEventListener("error", function (event) {
    var err   = event.error;
    var stack = err && err.stack ? err.stack : (event.filename + ":" + event.lineno + ":" + event.colno);
    send(event.message, stack);
  });

  // Capture unhandled promise rejections.
  window.addEventListener("unhandledrejection", function (event) {
    var reason  = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason);
    var stack   = reason instanceof Error ? (reason.stack || "") : "";
    send(message, stack);
  });

  // Expose for manual reporting from application code.
  window.SE = window.SE || {};
  window.SE.logger = { report: send };
})();
