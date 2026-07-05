const BOOKING_WEBHOOK_BASE_URL = "https://n8nnoob.dpdns.org/webhook";

(() => {
  const endpoints = {
    availability: `${BOOKING_WEBHOOK_BASE_URL}/check-availability`,
    booking: `${BOOKING_WEBHOOK_BASE_URL}/book-appointment`
  };

  const BOOKING_STEP_COUNT = 4;
  const AVAILABILITY_DAYS_TO_CHECK = 7;
  const AVAILABILITY_CHECK_CONCURRENCY = 4;
  const AVAILABILITY_RETRY_COUNT = 2;

  const state = {
    step: 0,
    availability: null,
    availableSlots: [],
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
    confirm: "[data-booking-confirm]",
    closeSuccess: "[data-booking-success-close]",
    status: "[data-booking-status]",
    slots: "[data-booking-slots]",
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
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const todayAsDateInput = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const normalizeAvailability = (value) => {
    if (typeof value === "string") return value.toLowerCase();
    if (!value || typeof value !== "object") return "";
    return String(value.status || value.availability || value.available || "").toLowerCase();
  };

  const getDurationMinutes = () => Number(String(state.data.duration || "").match(/\d+/)?.[0] || 30);

  const formatDateLabel = (dateValue) => {
    const [year, month, day] = dateValue.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(date);
  };

  const formatSlotLabel = (time) => {
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  };

  const generateCandidateDates = () => {
    return Array.from({ length: AVAILABILITY_DAYS_TO_CHECK }, (_, index) => todayAsDateInput(index));
  };

  const generateCandidateTimes = () => {
    const durationMinutes = getDurationMinutes();
    const startHour = 9;
    const endHour = 17;
    const stepMinutes = 60;
    const slots = [];

    for (let totalMinutes = startHour * 60; totalMinutes + durationMinutes <= endHour * 60; totalMinutes += stepMinutes) {
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }

    return slots;
  };

  const runWithConcurrency = async (items, limit, task) => {
    const results = [];
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await task(items[currentIndex]);
      }
    });

    await Promise.all(workers);
    return results;
  };

  const wait = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

  const createModal = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";
    state.data.timezone = timezone;

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
            ${Array.from({ length: BOOKING_STEP_COUNT }, (_, index) => `<span data-booking-progress="${index}"></span>`).join("")}
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
                <h3>Project Details</h3>
                <div class="booking-field full" data-field="description">
                  <label for="bookingDescription">How can I help? *</label>
                  <textarea id="bookingDescription" name="description" placeholder="Tell me about your business and how I can help." required></textarea>
                  <span class="booking-error-text" aria-live="polite"></span>
                </div>
              </div>

              <div class="booking-step" data-booking-step="2">
                <h3>Available Consultation Times</h3>
                <div class="booking-grid booking-meeting-options">
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
                <input id="bookingDate" name="date" type="hidden">
                <input id="bookingTime" name="time" type="hidden">
                <div class="booking-availability">
                  <div class="booking-status-card" data-booking-status>
                    Available dates will load automatically.
                  </div>
                  <div class="booking-slot-grid" data-booking-slots aria-live="polite"></div>
                </div>
              </div>

              <div class="booking-step" data-booking-step="3">
                <h3>Confirmation</h3>
                <div class="booking-summary" data-booking-summary></div>
                <div class="booking-error-card booking-hidden" data-booking-error>
                  Unable to submit booking. Please try again.
                </div>
              </div>

              <div class="booking-step" data-booking-step="4">
                <div class="booking-success">
                  <div class="booking-success-icon">✓</div>
                  <h3>Thank you!</h3>
                  <p>Your consultation request has been received.</p>
                  <p>You'll receive a confirmation email once the request is approved.</p>
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
    state.data.services = [];
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

    if (state.step === 1 && !state.data.description) {
      setError("description", "Project details are required.");
      isValid = false;
    }

    if (state.step === 2) {
      ["timezone", "duration"].forEach((key) => {
        if (!state.data[key]) {
          setError(key, "This field is required.");
          isValid = false;
        }
      });

      if (!state.data.date || !state.data.time) isValid = false;
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
      <div class="booking-summary-row"><strong>Meeting Time</strong><span>${formatDateLabel(state.data.date)} at ${formatSlotLabel(state.data.time)} (${state.data.duration})</span></div>
      <div class="booking-summary-row"><strong>Timezone</strong><span>${state.data.timezone}</span></div>
    `;
  };

  const renderAvailability = (message, statusClass = "") => {
    const status = modal.querySelector(selectors.status);
    if (!status) return;
    status.className = `booking-status-card ${statusClass}`.trim();
    status.innerHTML = message;
  };

  const groupSlotsByDate = () => {
    return state.availableSlots.reduce((groups, slot) => {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
      return groups;
    }, {});
  };

  const renderSlots = () => {
    const slots = modal.querySelector(selectors.slots);
    if (!slots) return;

    if (!state.availableSlots.length) {
      slots.innerHTML = "";
      return;
    }

    const groupedSlots = groupSlotsByDate();
    const dateButtons = Object.entries(groupedSlots).map(([date, dateSlots]) => `
      <button class="booking-date-button${state.data.date === date ? " is-selected" : ""}" type="button" data-available-date="${date}">
        <strong>${formatDateLabel(date)}</strong>
        <span>${dateSlots.length} times</span>
      </button>
    `).join("");
    const selectedSlots = state.data.date ? groupedSlots[state.data.date] || [] : [];

    slots.innerHTML = `
      <div class="booking-date-selector">${dateButtons}</div>
      ${state.data.date ? `
        <div class="booking-date-group">
          <p class="booking-date-label">${formatDateLabel(state.data.date)}</p>
          <div class="booking-date-slots">
            ${selectedSlots.map((slot) => `
              <button class="booking-slot${state.data.time === slot.time ? " is-selected" : ""}" type="button" data-slot-date="${slot.date}" data-slot-time="${slot.time}">
                ${formatSlotLabel(slot.time)}
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}
    `;
  };

  const renderStep = () => {
    modal.querySelectorAll(selectors.step).forEach((step) => {
      step.classList.toggle("is-active", Number(step.dataset.bookingStep) === state.step);
    });

    modal.querySelectorAll(selectors.progress).forEach((progress) => {
      const index = Number(progress.dataset.bookingProgress);
      progress.classList.toggle("is-active", index === state.step);
      progress.classList.toggle("is-complete", index < state.step || state.step === BOOKING_STEP_COUNT);
    });

    const backButton = modal.querySelector(selectors.back);
    const nextButton = modal.querySelector(selectors.next);
    const confirmButton = modal.querySelector(selectors.confirm);
    const successCloseButton = modal.querySelector(selectors.closeSuccess);

    backButton.classList.toggle("booking-hidden", state.step === 0 || state.step === BOOKING_STEP_COUNT);
    nextButton.classList.toggle("booking-hidden", state.step >= 3);
    confirmButton.classList.toggle("booking-hidden", state.step !== 3);
    successCloseButton.classList.toggle("booking-hidden", state.step !== BOOKING_STEP_COUNT);

    nextButton.disabled = state.step === 2 && (state.availability !== "available" || state.isChecking || !state.data.date || !state.data.time);
    if (state.step === 3) renderSummary();
    renderSlots();
  };

  const resetAvailability = () => {
    state.availability = null;
    state.availableSlots = [];
    state.data.date = "";
    state.data.time = "";
    const date = getField("date");
    const time = getField("time");
    if (date) date.value = "";
    if (time) time.value = "";
    renderAvailability("Available dates will load automatically.");
    renderSlots();
  };

  const checkSlot = async (date, time) => {
    for (let attempt = 0; attempt <= AVAILABILITY_RETRY_COUNT; attempt += 1) {
      try {
        const response = await fetch(endpoints.availability, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain"
          },
          body: JSON.stringify({
            name: state.data.name,
            email: state.data.email,
            date,
            time,
            timezone: state.data.timezone,
            duration: state.data.duration
          })
        });
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json() : await response.text();
        const result = normalizeAvailability(payload);

        if (response.ok && (result === "available" || result === "true")) return { date, time };
        if (response.ok) return null;
      } catch (error) {
        if (attempt === AVAILABILITY_RETRY_COUNT) return null;
      }

      await wait(350 * (attempt + 1));
    }

    return null;
  };

  const checkAvailabilityRange = async (dates) => {
    const response = await fetch(endpoints.availability, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain"
      },
      body: JSON.stringify({
        name: state.data.name,
        email: state.data.email,
        dateRangeStart: dates[0],
        dateRangeEnd: dates[dates.length - 1],
        timezone: state.data.timezone,
        duration: state.data.duration
      })
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok || !payload || !Array.isArray(payload.slots)) {
      throw new Error("Range availability failed.");
    }

    return payload.slots.filter((slot) => slot.date && slot.time);
  };

  const checkAvailabilityFallback = async (dates) => {
    const times = generateCandidateTimes();
    const checks = dates.flatMap((dateValue) => times.map((timeValue) => ({ date: dateValue, time: timeValue })));
    return (await runWithConcurrency(
      checks,
      AVAILABILITY_CHECK_CONCURRENCY,
      ({ date: dateValue, time: timeValue }) => checkSlot(dateValue, timeValue)
    )).filter(Boolean);
  };

  const loadAvailability = async () => {
    collectData();
    clearErrors();

    if (!state.data.timezone || !state.data.duration) {
      ["timezone", "duration"].forEach((key) => {
        if (!state.data[key]) setError(key, "This field is required.");
      });
      return;
    }

    state.isChecking = true;
    state.availability = null;
    state.availableSlots = [];
    state.data.date = "";
    state.data.time = "";
    const date = getField("date");
    const time = getField("time");
    if (date) date.value = "";
    if (time) time.value = "";
    renderSlots();
    renderAvailability(`<span class="booking-spinner" aria-hidden="true"></span>Loading available dates...`);
    renderStep();

    try {
      const dates = generateCandidateDates();
      try {
        state.availableSlots = await checkAvailabilityRange(dates);
      } catch (error) {
        state.availableSlots = await checkAvailabilityFallback(dates);
      }

      if (state.availableSlots.length) {
        state.availability = "available";
        renderAvailability("Choose an available date below.", "available");
      } else {
        state.availability = "unavailable";
        renderAvailability("No available consultation times were found in the next 7 days.", "unavailable");
      }
    } catch (error) {
      state.availability = "unavailable";
      renderAvailability("Unable to load available dates. Please try again.", "unavailable");
    } finally {
      state.isChecking = false;
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

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : {};

      if (!response.ok || payload.success === false) throw new Error(payload.message || "Booking submission failed.");

      state.step = BOOKING_STEP_COUNT;
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
    state.availableSlots = [];
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
    const date = getField("date");
    const time = getField("time");
    if (timezone) timezone.value = state.data.timezone;
    if (duration) duration.value = state.data.duration;
    if (date) date.value = "";
    if (time) time.value = "";
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

  const handleNext = async () => {
    if (!validateStep()) return;

    if (state.step === 1) {
      state.step = 2;
      renderStep();
      loadAvailability();
      return;
    }

    if (state.step === 2 && state.availability !== "available") return;
    state.step = Math.min(state.step + 1, 3);
    renderStep();
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

    modal.querySelector(selectors.next).addEventListener("click", handleNext);

    modal.querySelector(selectors.back).addEventListener("click", () => {
      state.step = Math.max(state.step - 1, 0);
      renderStep();
    });

    modal.querySelector(selectors.slots).addEventListener("click", (event) => {
      const dateButton = event.target.closest("[data-available-date]");
      if (dateButton) {
        state.data.date = dateButton.dataset.availableDate;
        state.data.time = "";
        const date = getField("date");
        const time = getField("time");
        if (date) date.value = state.data.date;
        if (time) time.value = "";
        renderAvailability(`Choose an available time for ${formatDateLabel(state.data.date)}.`, "available");
        renderStep();
        return;
      }

      const slot = event.target.closest("[data-slot-time]");
      if (!slot) return;

      state.data.date = slot.dataset.slotDate;
      state.data.time = slot.dataset.slotTime;
      const date = getField("date");
      const time = getField("time");
      if (date) date.value = state.data.date;
      if (time) time.value = state.data.time;
      state.availability = "available";
      renderAvailability(`${formatDateLabel(state.data.date)} at ${formatSlotLabel(state.data.time)} is selected.`, "available");
      renderStep();
    });

    modal.querySelector(selectors.confirm).addEventListener("click", submitBooking);
    modal.querySelector(selectors.closeSuccess).addEventListener("click", closeModal);

    ["timezone", "duration"].forEach((key) => {
      const field = getField(key);
      field.addEventListener("input", () => {
        resetAvailability();
        if (state.step === 2) loadAvailability();
      });
      field.addEventListener("change", () => {
        resetAvailability();
        if (state.step === 2) loadAvailability();
      });
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
