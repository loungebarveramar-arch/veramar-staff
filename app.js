const $ = (id) => document.getElementById(id);

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwklJqyvIhG_kU6gfba5jPa9ZawJ1HghkaMir9dkHRS8qbZBev2HkAqAj5fIw_l6FWr/exec";

const DEFAULT_EMPLOYEES = [
  "ABDOU TAMBAJAN",
  "CAMARERO 1",
  "CAMARERO 2",
  "CESAR",
  "FELIPE CORDEIRO",
  "LAURA",
  "MAR MORENO",
  "MARTINA COMACHI",
  "MOUSSA SISOKKO",
  "ZAKARIA BANANE"
];

let editingId = null;
let deferredPrompt = null;
let syncInProgress = false;

function loadEmployees() {
  try {
    const saved = JSON.parse(localStorage.getItem("veramar_employees") || "[]");
    return [...new Set([...DEFAULT_EMPLOYEES, ...(Array.isArray(saved) ? saved : [])])]
      .sort((a, b) => a.localeCompare(b, "es"));
  } catch {
    return [...DEFAULT_EMPLOYEES];
  }
}

function saveEmployees(list) {
  localStorage.setItem("veramar_employees", JSON.stringify(list));
}

function loadRecords() {
  try {
    const records = JSON.parse(localStorage.getItem("veramar_records") || "[]");
    if (!Array.isArray(records)) return [];

    let changed = false;
    const normalized = records.map((record) => {
      const item = { ...record };
      if (!item.id) { item.id = createId(); changed = true; }
      if (!item.syncStatus) { item.syncStatus = "pending"; changed = true; }
      if (!item.operation) { item.operation = "upsert"; changed = true; }
      return item;
    });

    if (changed) saveRecords(normalized);
    return normalized;
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem("veramar_records", JSON.stringify(records));
}

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) { return String(date || "").slice(0, 7); }

function normalizeTime(value) {
  let time = String(value || "").trim().replace(".", ":");
  if (!time) return "";
  if (/^\d{1,2}$/.test(time)) return `${time.padStart(2, "0")}:00`;
  if (/^\d{3}$/.test(time)) return `0${time[0]}:${time.slice(1)}`;
  if (/^\d{4}$/.test(time)) return `${time.slice(0, 2)}:${time.slice(2)}`;
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  return "";
}

function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let a = sh * 60 + sm;
  let b = eh * 60 + em;
  if (b < a) b += 1440;
  return (b - a) / 60;
}

function fmtHours(value) { return Number(value || 0).toFixed(2).replace(".", ","); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function createId() {
  return window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function refreshEmployeeSelects() {
  const employees = loadEmployees();
  const employeeSelect = $("empleado");
  const summarySelect = $("resumenEmpleado");
  const currentSummary = summarySelect.value;

  employeeSelect.innerHTML = '<option value="">SELECCIONA EMPLEADO</option>';
  employees.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    employeeSelect.appendChild(option);
  });

  summarySelect.innerHTML = "";
  employees.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    summarySelect.appendChild(option);
  });

  if (currentSummary && employees.includes(currentSummary)) summarySelect.value = currentSummary;
  employeeSelect.value = "";
  renderEmployeeList();
}

function updateHours() {
  const start = normalizeTime($("entrada").value);
  const end = normalizeTime($("salida").value);
  $("horas").textContent = fmtHours(calcHours(start, end));
}

function showMessage(text, ok = true) {
  $("mensaje").textContent = text;
  $("mensaje").style.color = ok ? "#067647" : "#B42318";
}

function resetForm() {
  editingId = null;
  $("empleado").value = "";
  $("fecha").value = todayISO();
  $("turno").value = "COMIDA";
  $("entrada").value = "";
  $("salida").value = "";
  $("observaciones").value = "";
  $("horas").textContent = "0,00";
  $("guardarBtn").disabled = false;
  $("guardarBtn").textContent = "Guardar turno";
}

function postForm(record, operation = "upsert") {
  const data = new URLSearchParams();
  ["id", "empleado", "fecha", "turno", "entrada", "salida", "horas", "observaciones", "fechaRegistro"]
    .forEach((key) => data.append(key, record[key] ?? ""));
  data.append("operation", operation);

  return fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`, {
    method: "POST",
    mode: "no-cors",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: data.toString()
  });
}

function jsonp(params, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName = `veramar_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); reject(new Error("Tiempo de espera agotado")); }, timeout);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => { cleanup(); resolve(data); };
    const query = new URLSearchParams({ ...params, callback: callbackName, t: String(Date.now()) });
    script.src = `${GOOGLE_SCRIPT_URL}?${query}`;
    script.onerror = () => { cleanup(); reject(new Error("No se pudo comprobar el registro")); };
    document.body.appendChild(script);
  });
}

async function verifyRecord(id, shouldExist = true) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await jsonp({ action: "exists", id });
      if (response && response.ok === true && response.exists === shouldExist) return true;
    } catch {}
    if (attempt < 2) await delay(1000);
  }
  return false;
}

async function syncOne(record) {
  try {
    const operation = record.operation || "upsert";
    await postForm(record, operation);
    await delay(700);
    return await verifyRecord(record.id, operation !== "delete");
  } catch {
    return false;
  }
}

async function syncPending(showFinalMessage = true) {
  if (syncInProgress) {
    showMessage("La sincronización ya está en marcha.", false);
    return;
  }

  const pendingRecords = loadRecords().filter((record) => record.syncStatus !== "synced");
  if (!pendingRecords.length) {
    showMessage("No hay registros pendientes.", true);
    return;
  }
  if (!navigator.onLine) {
    showMessage("No hay conexión a Internet.", false);
    updateOnlineBadge();
    return;
  }

  syncInProgress = true;
  $("sincronizarBtn").disabled = true;
  let sent = 0;
  let failed = 0;

  try {
    for (let index = 0; index < pendingRecords.length; index++) {
      const pending = pendingRecords[index];
      showMessage(`Sincronizando ${index + 1} de ${pendingRecords.length}…`, true);

      const currentRecords = loadRecords();
      const currentIndex = currentRecords.findIndex((record) => record.id === pending.id);
      if (currentIndex < 0) continue;

      const done = await syncOne(currentRecords[currentIndex]);
      currentRecords[currentIndex].syncStatus = done ? "synced" : "pending";
      done ? sent++ : failed++;
      saveRecords(currentRecords);
      renderSyncStats();
      renderRecords();
    }

    saveRecords(loadRecords().filter((record) => !(record.operation === "delete" && record.syncStatus === "synced")));
    renderAll();

    if (showFinalMessage) {
      showMessage(
        failed === 0 ? `Sincronización terminada: ${sent} enviados.` : `${sent} enviados y ${failed} pendientes.`,
        failed === 0
      );
    }
  } catch (error) {
    showMessage(`Error al sincronizar: ${error.message || "error desconocido"}`, false);
  } finally {
    syncInProgress = false;
    $("sincronizarBtn").disabled = false;
  }
}

async function saveTurn() {
  const empleado = $("empleado").value;
  const fecha = $("fecha").value;
  const turno = $("turno").value;
  const entrada = normalizeTime($("entrada").value);
  const salida = normalizeTime($("salida").value);
  const observaciones = $("observaciones").value.trim();

  if (!empleado) return showMessage("Selecciona un empleado.", false);
  if (!fecha) return showMessage("Selecciona la fecha.", false);
  if (!entrada || !salida) return showMessage("Introduce correctamente entrada y salida.", false);

  const horas = calcHours(entrada, salida);
  const records = loadRecords();
  if (records.some((record) => record.id !== editingId && record.operation !== "delete" && record.empleado === empleado && record.fecha === fecha && record.turno === turno && record.entrada === entrada && record.salida === salida)) {
    return showMessage("Ese turno exacto ya existe.", false);
  }

  const recordIndex = records.findIndex((record) => record.id === editingId);
  const record = {
    id: editingId || createId(), empleado, fecha, turno, entrada, salida, horas, observaciones,
    fechaRegistro: recordIndex >= 0 ? records[recordIndex].fechaRegistro : new Date().toISOString(),
    syncStatus: "pending", operation: "upsert"
  };

  recordIndex >= 0 ? records[recordIndex] = record : records.push(record);
  saveRecords(records);
  resetForm();
  renderAll();
  showMessage(navigator.onLine ? "Turno guardado. Pulsa Sincronizar." : "Turno guardado en el móvil.", true);
}

function editRecord(id) {
  const record = loadRecords().find((item) => item.id === id);
  if (!record || record.operation === "delete") return;
  editingId = id;
  $("empleado").value = record.empleado;
  $("fecha").value = record.fecha;
  $("turno").value = record.turno;
  $("entrada").value = record.entrada;
  $("salida").value = record.salida;
  $("observaciones").value = record.observaciones || "";
  updateHours();
  $("guardarBtn").textContent = "Guardar cambios";
  scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  if (!confirm("¿Quieres borrar este registro?")) return;
  const records = loadRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return;

  if (records[index].syncStatus === "synced") {
    records[index] = { ...records[index], operation: "delete", syncStatus: "pending" };
  } else {
    records.splice(index, 1);
  }

  saveRecords(records);
  renderAll();
  showMessage("Registro preparado. Pulsa Sincronizar para aplicar los cambios.", true);
}

function renderRecords() {
  const list = $("lista");
  list.innerHTML = "";
  const records = loadRecords().filter((record) => record.operation !== "delete")
    .sort((a, b) => (b.fecha + b.entrada).localeCompare(a.fecha + a.entrada)).slice(0, 30);

  if (!records.length) { list.innerHTML = "<p>No hay registros todavía.</p>"; return; }

  records.forEach((record) => {
    const node = $("registroTpl").content.cloneNode(true);
    node.querySelector(".r-empleado").textContent = record.empleado;
    node.querySelector(".r-detalle").textContent = `${record.fecha.split("-").reverse().join("/")} · ${record.turno} · ${record.entrada}-${record.salida} · ${fmtHours(record.horas)} h`;
    const status = node.querySelector(".r-estado");
    status.textContent = record.syncStatus === "synced" ? "Guardado online" : "Pendiente de sincronizar";
    status.className = `r-estado ${record.syncStatus === "synced" ? "ok" : "pending"}`;
    node.querySelector(".editar").onclick = () => editRecord(record.id);
    node.querySelector(".eliminar").onclick = () => deleteRecord(record.id);
    list.appendChild(node);
  });
}

function renderSummary() {
  const employee = $("resumenEmpleado").value;
  const month = monthKey($("fecha").value || todayISO());
  const records = loadRecords().filter((record) => record.operation !== "delete" && record.empleado === employee && monthKey(record.fecha) === month);
  $("resHoras").textContent = fmtHours(records.reduce((sum, record) => sum + Number(record.horas || 0), 0));
  $("resTurnos").textContent = records.length;
}

function renderSyncStats() {
  const records = loadRecords();
  $("pendientes").textContent = records.filter((record) => record.syncStatus !== "synced").length;
  $("sincronizados").textContent = records.filter((record) => record.syncStatus === "synced" && record.operation !== "delete").length;
}

function updateOnlineBadge() {
  const badge = $("onlineBadge");
  badge.textContent = navigator.onLine ? "Con conexión" : "Sin conexión";
  badge.className = `badge ${navigator.onLine ? "online" : "offline"}`;
}

function exportCSV() {
  const records = loadRecords().filter((record) => record.operation !== "delete").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const headers = ["ID", "EMPLEADO", "FECHA", "TURNO", "ENTRADA", "SALIDA", "HORAS", "OBSERVACIONES", "FECHA_REGISTRO", "ESTADO"];
  const rows = records.map((record) => [record.id, record.empleado, record.fecha, record.turno, record.entrada, record.salida, String(record.horas).replace(".", ","), record.observaciones || "", record.fechaRegistro, record.syncStatus]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `veramar_turnos_${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderEmployeeList() {
  const container = $("empleadosLista");
  container.innerHTML = "";
  loadEmployees().forEach((name) => {
    const row = document.createElement("div");
    row.className = "employee-item";
    const label = document.createElement("span");
    label.textContent = name;
    const button = document.createElement("button");
    button.className = "danger small";
    button.textContent = "Quitar";
    button.onclick = () => {
      if (confirm(`¿Quieres quitar a ${name}?`)) {
        saveEmployees(loadEmployees().filter((employee) => employee !== name));
        refreshEmployeeSelects();
        renderAll();
      }
    };
    row.append(label, button);
    container.appendChild(row);
  });
}

function addEmployee() {
  const name = $("nuevoEmpleado").value.trim().toUpperCase();
  if (!name) return;
  const employees = loadEmployees();
  if (!employees.includes(name)) { employees.push(name); saveEmployees(employees); }
  $("nuevoEmpleado").value = "";
  refreshEmployeeSelects();
  renderAll();
}

function renderAll() { renderRecords(); renderSummary(); renderSyncStats(); updateOnlineBadge(); }

$("guardarBtn").onclick = saveTurn;
$("exportarBtn").onclick = exportCSV;
$("sincronizarBtn").onclick = () => syncPending(true);
$("anadirEmpleadoBtn").onclick = addEmployee;

$("entrada").addEventListener("blur", () => { const time = normalizeTime($("entrada").value); if (time) $("entrada").value = time; updateHours(); });
$("salida").addEventListener("blur", () => { const time = normalizeTime($("salida").value); if (time) $("salida").value = time; updateHours(); });
$("resumenEmpleado").onchange = renderSummary;
$("fecha").onchange = renderSummary;

addEventListener("online", () => { updateOnlineBadge(); showMessage("Conexión recuperada. Pulsa Sincronizar.", true); });
addEventListener("offline", () => { updateOnlineBadge(); showMessage("Sin conexión. Los registros quedan guardados en el móvil.", false); });

addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; $("installBtn").classList.remove("hidden"); });
$("installBtn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

refreshEmployeeSelects();
resetForm();
renderAll();

if (loadRecords().some((record) => record.syncStatus !== "synced")) {
  showMessage("Hay registros pendientes. Pulsa Sincronizar.", true);
}
