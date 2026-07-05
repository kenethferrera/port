const BOOKING_WEBHOOK_BASE_URL = "https://your-n8n-domain.com/webhook";

(() => {
  const endpoints = {
    availability: `${BOOKING_WEBHOOK_BASE_URL}/check-availability`,
    booking: `${BOOKING_WEBHOOK_BASE_URL}/book-appointment`
  };

  const serviceOptions = [
    "Administrative Support",
    "Data Entry",
    "Email Management",
    "Calendar Management",
    "Recruitment Support",
    "Document Management",
    "Other"
  ];

  const state = {
    step: 0,
    availability: null,
    isChecking: false,
    isSubmitting: false,
    data: {
      name: "",
      email: "",
      phone: "",
      company: "",
      services: [],
      description: "",
      date: "",
      time: "",
      timezone: "",
      duration: "30 Minutes"
    }
  };

  let modal;
  let previouslyFocused;

  const selectors = {
    openButton: "[data-booking-open]",
    closeButton: "[data-booking-close]",
    step: "[data-booking-step]",
    progress: "[data-booking-progress]",
    next: "[data-booking-next]",
    back: "[data-booking-back]",
    check: "[data-booking-check]",
    confirm: "[data-booking-confirm]",
    closeSuccess: "[data-booking-success-close]",
    status: "[data-booking-status]",
    summary: "[data-booking-summary]",
    error: "[data-booking-error]"
  };

  const fields = {
    name: "bookingName",
    email: "bookingEmail",
    phone: "bookingPhone",
    company: "bookingCompany",
    description: "bookingDescription",
    date: "bookingDate",
    time: "bookingTime",
    timezone: "bookingTimezone",
    duration: "bookingDuration"
  };

  const getField = (key) => document.getElementById(fields[key]);
  const getServices = () => Array.from(document.querySelectorAll("input[name='bookingServices']:checked")).map((input) => input.value);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const normalizeAvailability = (value) => {
    if (typeof value === "string") return value.toLowerCase();
    if (!value || typeof value !== "object") return "";
    return String(value.status || value.availability || value.available || "").toLowerCase();
  };

  const createModal = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";
    state.data.timezone = timezone;

    const serviceMarkup = serviceOptions.map((service) => `
      <label class="booking-option">
        <input type="checkbox" name="bookingServices" value="${service}">
        <span>${service}</span>
      </label>
    `).join("");

    const modalMarkup = `
      <div class="booking-overlay" id="bookingOverlay" aria-hidden="true">
        <section class="booking-modal" role="dialog" aria-modal="true" aria-labelledby="bookingTitle">
          <header class="booking-header">
            <div>
              <p class="booking-kicker">Consultation</p>
              <h2 class="booking-title" id="bookingTitle">Book a Consultation</h2>
              <p class="booking-subtitle">Share a few details so I can understand how to support your business.</p>
            </div>
            <button class="booking-close" type="button" aria-label="Close booking modal" data-booking-close>
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>

          <div class="booking-progress" aria-label="Booking progress">
            ${Array.from({ length: 6 }, (_, index) => `<span data-booking-progress="${index}"></span>`).join("")}
          </div>

          <div class="booking-body">
            <form id="bookingForm" novalidate>
              <div class="booking-step" data-booking-step="0">
                <h3>Personal Information</h3>
                <div class="booking-grid">
                  <div class="booking-field" data-field="name">
                    <label for="bookingName">Full Name *</label>
                    <input id="bookingName" name="name" type="text" autocomplete="name" required>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="email">
                    <label for="bookingEmail">Email *</label>
                    <input id="bookingEmail" name="email" type="email" autocomplete="email" required>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="phone">
                    <label for="bookingPhone">Phone Number</label>
                    <input id="bookingPhone" name="phone" type="tel" autocomplete="tel">
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="company">
                    <label for="bookingCompany">Company</label>
                    <input id="bookingCompany" name="company" type="text" autocomplete="organization">
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                </div>
              </div>

              <div class="booking-step" data-booking-step="1">
                <h3>Service Needed</h3>
                <p class="booking-group-label">Choose all that apply.</p>
                <div class="booking-options" data-field="services">${serviceMarkup}</div>
                <span class="booking-error-text" data-services-error aria-live="polite"></span>
              </div>

              <div class="booking-step" data-booking-step="2">
                <h3>Project Details</h3>
                <div class="booking-field full" data-field="description">
                  <label for="bookingDescription">How can I help? *</label>
                  <textarea id="bookingDescription" name="description" placeholder="Tell me about your business and how I can help." required></textarea>
                  <span class="booking-error-text" aria-live="polite"></span>
                </div>
              </div>

              <div class="booking-step" data-booking-step="3">
                <h3>Meeting</h3>
                <div class="booking-grid">
                  <div class="booking-field" data-field="date">
                    <label for="bookingDate">Preferred Date *</label>
                    <input id="bookingDate" name="date" type="date" required>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="time">
                    <label for="bookingTime">Preferred Time *</label>
                    <input id="bookingTime" name="time" type="time" required>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="timezone">
                    <label for="bookingTimezone">Timezone *</label>
                    <input id="bookingTimezone" name="timezone" type="text" value="${timezone}" required>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                  <div class="booking-field" data-field="duration">
                    <label for="bookingDuration">Duration *</label>
                    <select id="bookingDuration" name="duration" required>
                      <option>15 Minutes</option>
                      <option selected>30 Minutes</option>
                      <option>60 Minutes</option>
                    </select>
                    <span class="booking-error-text" aria-live="polite"></span>
                  </div>
                </div>
              </div>

              <div class="booking-step" data-booking-step="4">
                <h3>Availability</h3>
                <div class="booking-availability">
                  <div class="booking-status-card" data-booking-status>
                    Select your preferred meeting details, then check if the slot is available.
                  </div>
                  <button class="booking-btn secondary" type="button" data-booking-check>
                    Check Availability
                  </button>
                </div>
              </div>

              <div class="booking-step" data-booking-step="5">
                <h3>Confirmation</h3>
                <div class="booking-summary" data-booking-summary></div>
                <div class="booking-error-card booking-hidden" data-booking-error>
                  Unable to submit booking. Please try again.
                </div>
              </div>

              <div class="booking-step" data-booking-step="6">
                <div class="booking-success">
                  <div class="booking-success-icon">✓</div>
                  <h3>Thank you!</h3>
                  <p>Your consultation request has been received.</p>
                  <p>You'll receive a confirmation email shortly.</p>
                </div>
              </div>
            </form>
          </div>

          <footer class="booking-actions">
            <div class="booking-actions-left">
              <button class="booking-btn secondary" type="button" data-booking-back>Back</button>
            </div>
            <div class="booking-actions-right">
              <button class="booking-btn primary" type="button" data-booking-next>Next</button>
              <button class="booking-btn primary booking-hidden" type="button" data-booking-confirm>Confirm Booking</button>
              <button class="booking-btn primary booking-hidden" type="button" data-booking-success-close>Close</button>
            </div>
          </footer>
        </section>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalMarkup);
    modal = document.getElementById("bookingOverlay");
  };

  const collectData = () => {
    Object.keys(fields).forEach((key) => {
      const field = getField(key);
      if (field) state.data[key] = field.value.trim();
    });
    state.data.services = getServices();
  };

  const setError = (fieldKey, message = "") => {
    const wrapper = document.querySelector(`[data-field="${fieldKey}"]`);
    if (!wrapper) return;
    wrapper.classList.toggle("has-error", Boolean(message));
    const error = wrapper.querySelector(".booking-error-text");
    if (error) error.textContent = message;
  };

  const clearErrors = () => {
    Object.keys(fields).forEach((key) => setError(key));
    const serviceError = document.querySelector("[data-services-error]");
    if (serviceError) serviceError.textContent = "";
  };

  const validateStep = () => {
    collectData();
    clearErrors();
    let isValid = true;

    if (state.step === 0) {
      if (!state.data.name) {
        setError("name", "Full name is required.");
        isValid = false;
      }
      if (!state.data.email || !emailPattern.test(state.data.email)) {
        setError("email", "Please enter a valid email address.");
        isValid = false;
      }
    }

    if (state.step === 1 && state.data.services.length === 0) {
      const serviceError = document.querySelector("[data-services-error]");
      if (serviceError) serviceError.textContent = "Please select at least one service.";
      isValid = false;
    }

    if (state.step === 2 && !state.data.description) {
      setError("description", "Project details are required.");
      isValid = false;
    }

    if (state.step === 3 || state.step === 4) {
      ["date", "time", "timezone", "duration"].forEach((key) => {
        if (!state.data[key]) {
          setError(key, "This field is required.");
          isValid = false;
        }
      });
    }

    return isValid;
  };

  const setLoading = (button, isLoading, text) => {
    if (!button) return;
    button.disabled = isLoading;
    button.innerHTML = isLoading ? `<span class="booking-spinner" aria-hidden="true"></span>${text}` : text;
  };

  const renderSummary = () => {
    const summary = modal.querySelector(selectors.summary);
    if (!summary) return;
    summary.innerHTML = `
      <div class="booking-summary-row"><strong>Name</strong><span>${state.data.name}</span></div>
      <div class="booking-summary-row"><strong>Email</strong><span>${state.data.email}</span></div>
      <div class="booking-summary-row"><strong>Selected Service</strong><span>${state.data.services.join(", ")}</span></div>
      <div class="booking-summary-row"><strong>Meeting Time</strong><span>${state.data.date} at ${state.data.time} (${state.data.duration})</span></div>
      <div class="booking-summary-row"><strong>Timezone</strong><span>${state.data.timezone}</span></div>
    `;
  };

  const renderAvailability = (message, statusClass = "") => {
    const status = modal.querySelector(selectors.status);
    if (!status) return;
    status.className = `booking-status-card ${statusClass}`.trim();
    status.textContent = message;
  };

  const renderStep = () => {
    modal.querySelectorAll(selectors.step).forEach((step) => {
      step.classList.toggle("is-active", Number(step.dataset.bookingStep) === state.step);
    });

    modal.querySelectorAll(selectors.progress).forEach((progress) => {
      const index = Number(progress.dataset.bookingProgress);
      progress.classList.toggle("is-active", index === state.step);
      progress.classList.toggle("is-complete", index < state.step || state.step === 6);
    });

    const backButton = modal.querySelector(selectors.back);
    const nextButton = modal.querySelector(selectors.next);
    const confirmButton = modal.querySelector(selectors.confirm);
    const successCloseButton = modal.querySelector(selectors.closeSuccess);

    backButton.classList.toggle("booking-hidden", state.step === 0 || state.step === 6);
    nextButton.classList.toggle("booking-hidden", state.step >= 5);
    confirmButton.classList.toggle("booking-hidden", state.step !== 5);
    successCloseButton.classList.toggle("booking-hidden", state.step !== 6);

    nextButton.disabled = state.step === 4 && state.availability !== "available";
    if (state.step === 5) renderSummary();
  };

  const resetAvailability = () => {
    state.availability = null;
    renderAvailability("Select your preferred meeting details, then check if the slot is available.");
  };

  const checkAvailability = async () => {
    if (!validateStep()) return;
    const button = modal.querySelector(selectors.check);
    setLoading(button, true, "Checking");
    state.isChecking = true;

    try {
      const query = new URLSearchParams({
        date: state.data.date,
        time: state.data.time,
        timezone: state.data.timezone,
        duration: state.data.duration
      });
      const response = await fetch(`${endpoints.availability}?${query.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json, text/plain" }
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      const result = normalizeAvailability(payload);

      if (!response.ok) throw new Error("Availability check failed.");

      if (result === "available" || result === "true") {
        state.availability = "available";
        renderAvailability("✓ Available", "available");
      } else {
        state.availability = "unavailable";
        renderAvailability("This time isn't available. Please choose another slot.", "unavailable");
      }
    } catch (error) {
      state.availability = "unavailable";
      renderAvailability("Unable to check availability. Please try again.", "unavailable");
    } finally {
      state.isChecking = false;
      setLoading(button, false, "Check Availability");
      renderStep();
    }
  };

  const submitBooking = async () => {
    collectData();
    const button = modal.querySelector(selectors.confirm);
    const errorCard = modal.querySelector(selectors.error);
    errorCard.classList.add("booking-hidden");
    setLoading(button, true, "Submitting");
    state.isSubmitting = true;

    try {
      const response = await fetch(endpoints.booking, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain"
        },
        body: JSON.stringify(state.data)
      });

      if (!response.ok) throw new Error("Booking submission failed.");

      state.step = 6;
      renderStep();
    } catch (error) {
      errorCard.classList.remove("booking-hidden");
    } finally {
      state.isSubmitting = false;
      setLoading(button, false, "Confirm Booking");
    }
  };

  const resetForm = () => {
    state.step = 0;
    state.availability = null;
    state.isChecking = false;
    state.isSubmitting = false;
    state.data = {
      name: "",
      email: "",
      phone: "",
      company: "",
      services: [],
      description: "",
      date: "",
      time: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
      duration: "30 Minutes"
    };
    const form = document.getElementById("bookingForm");
    if (form) form.reset();
    const timezone = getField("timezone");
    const duration = getField("duration");
    if (timezone) timezone.value = state.data.timezone;
    if (duration) duration.value = state.data.duration;
    clearErrors();
    resetAvailability();
    const errorCard = modal.querySelector(selectors.error);
    if (errorCard) errorCard.classList.add("booking-hidden");
    renderStep();
  };

  const openModal = () => {
    previouslyFocused = document.activeElement;
    resetForm();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("booking-no-scroll");
    setTimeout(() => modal.querySelector(selectors.closeButton)?.focus(), 80);
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("booking-no-scroll");
    previouslyFocused?.focus?.();
  };

  const prepareCtas = () => {
    const ctas = Array.from(document.querySelectorAll("a, button")).filter((item) => {
      return item.textContent.trim().toLowerCase() === "hire me";
    });

    ctas.forEach((cta) => {
      cta.textContent = "Book a Consultation";
      cta.setAttribute("data-booking-open", "");
      cta.setAttribute("aria-haspopup", "dialog");
      if (cta.tagName.toLowerCase() === "a") cta.setAttribute("href", "#book-consultation");
    });
  };

  const handleKeydown = (event) => {
    if (!modal.classList.contains("is-open")) return;
    if (event.key === "Escape") closeModal();
  };

  const bindEvents = () => {
    document.addEventListener("click", (event) => {
      const opener = event.target.closest(selectors.openButton);
      if (!opener) return;
      event.preventDefault();
      event.stopPropagation();
      openModal();
    }, true);

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(selectors.closeButton)) closeModal();
    });

    modal.querySelector(selectors.next).addEventListener("click", () => {
      if (!validateStep()) return;
      if (state.step === 4 && state.availability !== "available") return;
      state.step = Math.min(state.step + 1, 5);
      renderStep();
    });

    modal.querySelector(selectors.back).addEventListener("click", () => {
      state.step = Math.max(state.step - 1, 0);
      renderStep();
    });

    modal.querySelector(selectors.check).addEventListener("click", checkAvailability);
    modal.querySelector(selectors.confirm).addEventListener("click", submitBooking);
    modal.querySelector(selectors.closeSuccess).addEventListener("click", closeModal);

    ["date", "time", "timezone", "duration"].forEach((key) => {
      getField(key).addEventListener("input", resetAvailability);
      getField(key).addEventListener("change", resetAvailability);
    });

    document.addEventListener("keydown", handleKeydown);
  };

  document.addEventListener("DOMContentLoaded", () => {
    createModal();
    prepareCtas();
    bindEvents();
    renderStep();
  });
})();
