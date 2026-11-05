// Find care near me + Report for my doctor.
// Uses `chatHistory` from script.js (loaded before this file).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------
  const nearbyModal = $("nearby-modal");
  const reportModal = $("report-modal");

  function openModal(modal) {
    modal.classList.remove("hidden");
    const closeBtn = modal.querySelector(".close");
    if (closeBtn) closeBtn.focus();
  }
  function closeModal(modal) {
    modal.classList.add("hidden");
  }

  [nearbyModal, reportModal].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.hasAttribute("data-close")) closeModal(modal);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal(nearbyModal);
      closeModal(reportModal);
    }
  });

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* not JSON */
    }
    if (!res.ok) throw new Error(data.error || data.reply || "Request failed (" + res.status + ")");
    return data;
  }

  // ------------------------------------------------------------
  // Find care near me
  // ------------------------------------------------------------
  const nStatus = $("nearby-status");
  const nList = $("nearby-results");
  const locateBtn = $("nearby-locate");
  const cityForm = $("nearby-city-form");
  const cityInput = $("nearby-city");

  const TYPE_LABEL = { hospital: "Hospital", clinic: "Clinic / doctor", pharmacy: "Pharmacy" };

  function setNearbyStatus(text, isError) {
    nStatus.textContent = text;
    nStatus.classList.toggle("error", Boolean(isError));
  }

  function setNearbyBusy(busy) {
    locateBtn.disabled = busy;
    cityForm.querySelector("button").disabled = busy;
  }

  function renderPlaces(data) {
    nList.replaceChildren();
    const places = data.places || [];
    const where = data.origin && data.origin.label ? data.origin.label : "your location";

    if (!places.length) {
      setNearbyStatus(
        "Nothing found within " + data.radiusKm + " km of " + where +
        ". Try a larger distance or another type. For urgent needs call 141 or 15."
      );
      return;
    }
    setNearbyStatus(places.length + " places near " + where + ", closest first.");

    for (const p of places) {
      const card = el("div", "place");

      const top = el("div", "place-top");
      top.appendChild(el("span", "place-name", p.name || TYPE_LABEL[p.type] + " (no name listed)"));
      top.appendChild(el("span", "place-dist", p.distanceKm + " km"));
      card.appendChild(top);

      const kind = el("div", "place-meta");
      kind.appendChild(el("span", "badge " + p.type, TYPE_LABEL[p.type] || "Care"));
      if (p.emergency) kind.appendChild(el("span", "badge hospital", "Emergency"));
      card.appendChild(kind);

      if (p.address) card.appendChild(el("div", "place-meta", p.address));
      if (p.hours) card.appendChild(el("div", "place-meta", "Hours: " + p.hours));

      const links = el("div", "place-links");
      const dir = el("a", "", "Directions");
      dir.href =
        "https://www.google.com/maps/dir/?api=1&destination=" +
        encodeURIComponent(Number(p.lat) + "," + Number(p.lon));
      dir.target = "_blank";
      dir.rel = "noopener noreferrer";
      links.appendChild(dir);

      const digits = (p.phone || "").replace(/[^\d+]/g, "");
      if (digits.length >= 4) {
        const call = el("a", "", "Call " + p.phone);
        call.href = "tel:" + digits;
        links.appendChild(call);
      }
      card.appendChild(links);

      nList.appendChild(card);
    }
  }

  async function searchNearby(origin) {
    nList.replaceChildren();
    setNearbyStatus("Searching...");
    setNearbyBusy(true);
    try {
      const data = await postJSON("/api/nearby", {
        ...origin,
        type: $("nearby-type").value,
        radiusKm: Number($("nearby-radius").value)
      });
      renderPlaces(data);
    } catch (err) {
      setNearbyStatus(err.message || "Search failed. Please try again.", true);
    } finally {
      setNearbyBusy(false);
    }
  }

  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setNearbyStatus(
        "Location is not available here (it needs a secure https page). Please type your city instead.",
        true
      );
      return;
    }
    setNearbyStatus("Waiting for your location...");
    setNearbyBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearbyBusy(false);
        searchNearby({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        setNearbyBusy(false);
        const msg =
          err.code === 1
            ? "Location permission was refused. You can type your city instead."
            : "Could not get your location. You can type your city instead.";
        setNearbyStatus(msg, true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });

  cityForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;
    searchNearby({ city });
  });

  $("btn-nearby").addEventListener("click", () => openModal(nearbyModal));

  // ------------------------------------------------------------
  // Report for my doctor
  // ------------------------------------------------------------
  const LABELS = {
    en: {
      title: "Pre-consultation summary",
      date: "Date",
      patient: "Patient",
      age: "Age",
      locale: "en-GB",
      tagline: "General health information assistant",
      subject: "Pre-consultation summary",
      disclaimer:
        "Generated by an AI assistant from information the patient typed in a chat. It summarises what the patient reported. It is not a diagnosis and has not been checked by a medical professional."
    },
    fr: {
      title: "Résumé avant consultation",
      date: "Date",
      patient: "Patient",
      age: "Âge",
      locale: "fr-FR",
      tagline: "Assistant d'information santé",
      subject: "Résumé avant consultation",
      disclaimer:
        "Généré par un assistant IA à partir des informations saisies par le patient dans une conversation. Il résume ce que le patient a déclaré. Ce n'est pas un diagnostic et il n'a pas été vérifié par un professionnel de santé."
    },
    ar: {
      title: "ملخص ما قبل الاستشارة",
      date: "التاريخ",
      patient: "المريض",
      age: "العمر",
      locale: "ar-MA",
      tagline: "مساعد المعلومات الصحية العامة",
      subject: "ملخص ما قبل الاستشارة",
      disclaimer:
        "تم إنشاء هذا الملخص بواسطة مساعد ذكاء اصطناعي اعتمادًا على المعلومات التي كتبها المريض في المحادثة. وهو يلخّص ما صرّح به المريض، وليس تشخيصًا، ولم يتم التحقق منه من قبل مختص طبي."
    }
  };

  const rStatus = $("report-status");
  const rDoc = $("report-doc");
  const rActions = $("report-actions");
  const nameInput = $("pf-name");
  const ageInput = $("pf-age");
  let currentReport = null;

  function setReportStatus(text, isError) {
    rStatus.textContent = text;
    rStatus.classList.toggle("error", Boolean(isError));
  }

  function formatDate(locale) {
    try {
      return new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function metaLine(labels) {
    const parts = [labels.date + ": " + formatDate(labels.locale)];
    const name = nameInput.value.trim();
    const age = ageInput.value.trim();
    if (name) parts.push(labels.patient + ": " + name);
    if (age) parts.push(labels.age + ": " + age);
    return parts.join("   |   ");
  }

  function renderReport() {
    if (!currentReport) return;
    const labels = LABELS[currentReport.lang] || LABELS.en;

    rDoc.replaceChildren();
    rDoc.dir = currentReport.lang === "ar" ? "rtl" : "ltr";
    rDoc.lang = currentReport.lang;

    const brand = el("div", "report-brand");
    const logo = document.createElement("img");
    logo.src = "logo.png";
    logo.alt = "UPSSA";
    brand.appendChild(logo);
    const brandText = el("div", "report-brand-text");
    brandText.appendChild(el("strong", "", "HealthChat"));
    brandText.appendChild(el("span", "", labels.tagline));
    brand.appendChild(brandText);
    rDoc.appendChild(brand);

    rDoc.appendChild(el("h3", "", labels.title));

    // Patient details box
    const info = el("div", "report-info");
    const cells = [
      [labels.date, formatDate(labels.locale)],
      [labels.patient, nameInput.value.trim() || "—"],
      [labels.age, ageInput.value.trim() || "—"]
    ];
    for (const [k, v] of cells) {
      const cell = el("div", "report-info-cell");
      cell.appendChild(el("span", "k", k));
      cell.appendChild(el("span", "v", v));
      info.appendChild(cell);
    }
    rDoc.appendChild(info);

    if (currentReport.summary) rDoc.appendChild(el("p", "report-summary", currentReport.summary));

    for (const section of currentReport.sections) {
      const box = el("section", "report-section");
      box.appendChild(el("h4", "", section.heading));
      const ul = el("ul");
      for (const item of section.items) ul.appendChild(el("li", "", item));
      box.appendChild(ul);
      rDoc.appendChild(box);
    }
    rDoc.appendChild(el("p", "report-foot", labels.disclaimer));

    rDoc.classList.remove("hidden");
    rActions.classList.remove("hidden");
  }

  function reportAsText() {
    if (!currentReport) return "";
    const labels = LABELS[currentReport.lang] || LABELS.en;
    const lines = [labels.title.toUpperCase(), metaLine(labels), ""];
    if (currentReport.summary) lines.push(currentReport.summary, "");
    for (const s of currentReport.sections) {
      lines.push(s.heading);
      for (const item of s.items) lines.push("- " + item);
      lines.push("");
    }
    lines.push(labels.disclaimer);
    return lines.join("\n");
  }

  async function generateReport() {
    rDoc.classList.add("hidden");
    rActions.classList.add("hidden");
    currentReport = null;

    const hasUserMessage = chatHistory.some((m) => m.role === "user");
    if (!hasUserMessage) {
      setReportStatus("Describe your symptoms in the chat first, then create the report.", true);
      return;
    }

    setReportStatus("Writing your report...");
    try {
      const data = await postJSON("/api/report", { messages: chatHistory });
      currentReport = data.report;
      setReportStatus("");
      renderReport();
    } catch (err) {
      setReportStatus(err.message || "Could not create the report.", true);
    }
  }

  $("btn-report").addEventListener("click", () => {
    openModal(reportModal);
    generateReport();
  });
  $("rp-refresh").addEventListener("click", generateReport);

  nameInput.addEventListener("input", renderReport);
  ageInput.addEventListener("input", renderReport);

  $("rp-print").addEventListener("click", () => {
    // The browser uses the page title as the default PDF file name
    const labels = LABELS[(currentReport && currentReport.lang) || "en"] || LABELS.en;
    const previousTitle = document.title;
    document.title = labels.title + " " + new Date().toISOString().slice(0, 10);
    window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
    setReportStatus("In the window that opens, choose 'Save as PDF' as the destination.");
    window.print();
  });

  $("rp-copy").addEventListener("click", async () => {
    const text = reportAsText();
    try {
      await navigator.clipboard.writeText(text);
      setReportStatus("Copied. You can paste it into a message or email.");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setReportStatus("Copied. You can paste it into a message or email.");
      } catch (e) {
        setReportStatus("Could not copy automatically. Select the text and copy it.", true);
      }
      ta.remove();
    }
  });

  const shareBtn = $("rp-share");
  if (navigator.share) {
    shareBtn.classList.remove("hidden");
    shareBtn.addEventListener("click", async () => {
      const labels = LABELS[(currentReport && currentReport.lang) || "en"] || LABELS.en;
      try {
        await navigator.share({ title: labels.subject, text: reportAsText() });
      } catch (_) {
        /* user closed the share sheet */
      }
    });
  }

  $("rp-email").addEventListener("click", () => {
    const labels = LABELS[(currentReport && currentReport.lang) || "en"] || LABELS.en;
    window.location.href =
      "mailto:?subject=" + encodeURIComponent(labels.subject) +
      "&body=" + encodeURIComponent(reportAsText());
  });
})();
