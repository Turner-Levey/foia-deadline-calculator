(function () {
  "use strict";

  const today = new Date();
  const form = document.querySelector("#deadline-form");
  const results = document.querySelector("#results");
  const output = document.querySelector("#memo-output");
  const fields = {
    requestLabel: document.querySelector("#request-label"),
    agency: document.querySelector("#agency"),
    startDate: document.querySelector("#start-date"),
    startBasis: document.querySelector("#start-basis"),
    pauseDays: document.querySelector("#pause-days"),
    extensionDays: document.querySelector("#extension-days"),
    responseDate: document.querySelector("#response-date"),
    trackerStatus: document.querySelector("#tracker-status"),
    closureDates: document.querySelector("#closure-dates"),
    requestNote: document.querySelector("#request-note"),
    nextStep: document.querySelector("#next-step")
  };

  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  fields.startDate.value = toIsoDate(today);

  function getValue(key) {
    return fields[key].value.trim();
  }

  function parseIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addCalendarDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function observedDate(year, monthIndex, day) {
    const date = new Date(Date.UTC(year, monthIndex, day, 12));
    const weekday = date.getUTCDay();
    if (weekday === 0) return addCalendarDays(date, 1);
    if (weekday === 6) return addCalendarDays(date, -1);
    return date;
  }

  function nthWeekday(year, monthIndex, weekday, occurrence) {
    const first = new Date(Date.UTC(year, monthIndex, 1, 12));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, monthIndex, 1 + offset + (occurrence - 1) * 7, 12));
  }

  function lastWeekday(year, monthIndex, weekday) {
    const last = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
    const offset = (last.getUTCDay() - weekday + 7) % 7;
    return addCalendarDays(last, -offset);
  }

  function standardFederalHolidaySet(year) {
    return new Set([
      observedDate(year, 0, 1),
      nthWeekday(year, 0, 1, 3),
      nthWeekday(year, 1, 1, 3),
      lastWeekday(year, 4, 1),
      observedDate(year, 5, 19),
      observedDate(year, 6, 4),
      nthWeekday(year, 8, 1, 1),
      nthWeekday(year, 9, 1, 2),
      observedDate(year, 10, 11),
      nthWeekday(year, 10, 4, 4),
      observedDate(year, 11, 25)
    ].map(toIsoDate));
  }

  function closureSetFor(anchorDate) {
    const years = [
      anchorDate.getUTCFullYear() - 1,
      anchorDate.getUTCFullYear(),
      anchorDate.getUTCFullYear() + 1
    ];
    const closures = new Set();
    years.forEach((year) => standardFederalHolidaySet(year).forEach((date) => closures.add(date)));
    getValue("closureDates")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
      .forEach((date) => closures.add(date));
    return closures;
  }

  function isBusinessDay(date, closures) {
    const day = date.getUTCDay();
    return day !== 0 && day !== 6 && !closures.has(toIsoDate(date));
  }

  function addBusinessDays(date, days, closures) {
    let next = new Date(date);
    let remaining = Number(days);
    while (remaining > 0) {
      next = addCalendarDays(next, 1);
      if (isBusinessDay(next, closures)) {
        remaining -= 1;
      }
    }
    return next;
  }

  function businessDaysBetween(from, to, closures) {
    let cursor = new Date(from);
    let days = 0;
    while (toIsoDate(cursor) < toIsoDate(to)) {
      cursor = addCalendarDays(cursor, 1);
      if (isBusinessDay(cursor, closures)) days += 1;
    }
    return days;
  }

  function formatDate(date) {
    return date ? toIsoDate(date) : "not entered";
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function icsDate(date) {
    return toIsoDate(date).replaceAll("-", "");
  }

  function icsDateTime(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function icsEscape(value) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,");
  }

  function slugPart(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "foia";
  }

  function calculate() {
    const startDate = parseIsoDate(getValue("startDate"));
    if (!startDate) {
      throw new Error("Enter a valid clock-start date.");
    }

    const pauseDays = Math.max(0, Number.parseInt(getValue("pauseDays") || "0", 10) || 0);
    const extensionDays = Number.parseInt(getValue("extensionDays") || "0", 10) || 0;
    const closures = closureSetFor(startDate);
    const statutoryDueDate = addBusinessDays(startDate, 20 + pauseDays, closures);
    const extensionDueDate = extensionDays ? addBusinessDays(statutoryDueDate, extensionDays, closures) : null;
    const checkInDate = addBusinessDays(startDate, 10, closures);
    const responseDate = parseIsoDate(getValue("responseDate"));
    const todayDate = parseIsoDate(toIsoDate(today));
    const businessDaysUntilDue = businessDaysBetween(todayDate, statutoryDueDate, closures);

    let statusLabel = "Open";
    if (responseDate) {
      statusLabel = responseDate <= statutoryDueDate ? "Response by 20-day target" : "Response after 20-day target";
    } else if (toIsoDate(todayDate) > toIsoDate(statutoryDueDate)) {
      statusLabel = "Past 20-day target";
    } else if (businessDaysUntilDue <= 2) {
      statusLabel = "Due soon";
    } else if (businessDaysUntilDue <= 5) {
      statusLabel = "Watch this week";
    }

    const warningLines = [
      "This worksheet estimates federal FOIA timing only. It does not decide perfection, tolling validity, expedited processing, constructive exhaustion, appeal timing, litigation strategy, state records law, or agency-specific exceptions.",
      "Verify the agency acknowledgment, tracking number, receipt date, tolling notices, extension notice, and any closure dates before relying on a deadline."
    ];

    const memo = [
      `FOIA deadline worksheet - ${getValue("requestLabel") || "Untitled request"}`,
      "",
      `Agency/component: ${getValue("agency") || "not entered"}`,
      `Clock-start date: ${formatDate(startDate)}`,
      `Clock-start basis: ${getValue("startBasis")}`,
      `20-working-day determination target: ${formatDate(statutoryDueDate)}`,
      `10-working-day check-in date: ${formatDate(checkInDate)}`,
      `Tolling / pause days added: ${pauseDays}`,
      `Unusual-circumstances extension target: ${extensionDueDate ? formatDate(extensionDueDate) : "not added"}`,
      `Agency response date: ${formatDate(responseDate)}`,
      `Tracker status: ${getValue("trackerStatus")}`,
      `Status label: ${statusLabel}`,
      "",
      `Request note: ${getValue("requestNote") || "none"}`,
      `Next step: ${getValue("nextStep") || "none"}`,
      "",
      "Sources:",
      "- DOJ FOIA Reference Guide: https://www.justice.gov/oip/department-justice-freedom-information-act-reference-guide",
      "- DOJ text of 5 U.S.C. 552: https://www.justice.gov/oip/freedom-information-act-5-usc-552",
      "- FOIA.gov request guide: https://www.foia.gov/how-to.html",
      "- OPM federal holidays: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/",
      "",
      "Cautions:",
      ...warningLines.map((line) => `- ${line}`)
    ].join("\n");

    const csvHeaders = [
      "request_label",
      "agency",
      "clock_start_date",
      "twenty_working_day_target",
      "check_in_date",
      "pause_days",
      "extension_target",
      "response_date",
      "tracker_status",
      "status_label",
      "next_step"
    ];
    const csvValues = [
      getValue("requestLabel"),
      getValue("agency"),
      formatDate(startDate),
      formatDate(statutoryDueDate),
      formatDate(checkInDate),
      pauseDays,
      extensionDueDate ? formatDate(extensionDueDate) : "",
      formatDate(responseDate),
      getValue("trackerStatus"),
      statusLabel,
      getValue("nextStep")
    ];

    return {
      startDate,
      statutoryDueDate,
      extensionDueDate,
      checkInDate,
      pauseDays,
      responseDate,
      statusLabel,
      memo,
      csv: `${csvHeaders.join(",")}\n${csvValues.map(csvEscape).join(",")}`
    };
  }

  let lastResult = null;

  function render() {
    try {
      const result = calculate();
      lastResult = result;
      results.innerHTML = `
        <div><span>20-day target</span><strong>${formatDate(result.statutoryDueDate)}</strong><small>${result.statusLabel}</small></div>
        <div><span>10-day check-in</span><strong>${formatDate(result.checkInDate)}</strong><small>working-day reminder</small></div>
        <div><span>Pause days</span><strong>${result.pauseDays}</strong><small>optional tolling input</small></div>
        <div><span>Extension target</span><strong>${result.extensionDueDate ? formatDate(result.extensionDueDate) : "None"}</strong><small>unusual circumstances</small></div>
      `;
      output.value = result.memo;
    } catch (error) {
      lastResult = null;
      results.innerHTML = `<div class="error">${error.message}</div>`;
      output.value = "";
    }
  }

  function download(name, type, body) {
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function copy(text) {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    output.focus();
    output.select();
    document.execCommand("copy");
  }

  function buildIcs(result) {
    const dueDate = result.statutoryDueDate;
    const endDate = addCalendarDays(dueDate, 1);
    const summary = `FOIA 20-day target: ${getValue("requestLabel") || "request"}`;
    const description = [
      `Agency: ${getValue("agency") || "not entered"}`,
      `Clock-start date: ${formatDate(result.startDate)}`,
      `20-working-day target: ${formatDate(result.statutoryDueDate)}`,
      `Extension target: ${result.extensionDueDate ? formatDate(result.extensionDueDate) : "not added"}`,
      `Status: ${result.statusLabel}`,
      `Next step: ${getValue("nextStep") || "not entered"}`
    ].join("\\n");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FOIA Deadline Calculator//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${slugPart(getValue("requestLabel"))}@foia-deadline-calculator`,
      `DTSTAMP:${icsDateTime(new Date())}`,
      `DTSTART;VALUE=DATE:${icsDate(dueDate)}`,
      `DTEND;VALUE=DATE:${icsDate(endDate)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ].join("\r\n");
  }

  document.querySelector("#calculate").addEventListener("click", render);
  document.querySelector("#copy-memo").addEventListener("click", () => copy(output.value));
  document.querySelector("#copy-csv").addEventListener("click", () => {
    if (!lastResult) render();
    if (lastResult) copy(lastResult.csv);
  });
  document.querySelector("#download-csv").addEventListener("click", () => {
    if (!lastResult) render();
    if (lastResult) {
      download(`${slugPart(getValue("requestLabel"))}-foia-deadline.csv`, "text/csv", lastResult.csv);
    }
  });
  document.querySelector("#download-ics").addEventListener("click", () => {
    if (!lastResult) render();
    if (lastResult) {
      download(`${slugPart(getValue("requestLabel"))}-foia-deadline.ics`, "text/calendar", buildIcs(lastResult));
    }
  });

  form.addEventListener("input", render);
  render();
})();
