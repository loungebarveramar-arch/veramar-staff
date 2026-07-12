const $ = (id) => document.getElementById(id);

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwd9AjY0V61FQivKYkrz2AILPUfv3Dxao_ECBzO1sta3Ho45eo_Ci2NTkUnE6dGL85r/exec";

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

function loadEmployees() {
  try {
    const saved = JSON.parse(localStorage.getItem("veramar_employees") || "[]");
    const combined = [...DEFAULT_EMPLOYEES, ...(Array.isArray(saved) ? saved : [])];
    return [...new Set(combined)].sort((a, b) => a.localeCompare(b, "es"));
  } catch (error) {
    return [...DEFAULT_EMPLOYEES];
  }
}

function saveEmployees(list) {
  localStorage.setItem("veramar_employees", JSON.stringify(list));
}

function loadRecords() {
  try {
    const records = JSON.parse(localStorage.getItem("veramar_records") || "[]");
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function saveRecords(list) {
  localStorage.setItem("veramar_records", JSON.stringify(list));
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

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
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return (endMinutes - startMinutes) / 60;
}

function fmtHours(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function refreshEmployeeSelects() {
  const employees = loadEmployees();
  const employeeSelect = $("empleado");
  const summarySelect = $("resumenEmpleado");
  const currentSummary = summarySelect.value;

  employeeSelect.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "SELECCIONA EMPLEADO";
  emptyOption.selected = true;
  employeeSelect.appendChild(emptyOption);

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

  if (currentSummary && employees.includes(currentSummary)) {
    summarySelect.value = currentSummary;
  }

  employeeSelect.value = "";
  renderEmployeeList();
}

function updateHours() {
  const entry = normalizeTime($("entrada").value);
  const exit = normalizeTime($("salida").value);
  $("horas").textContent = fmtHours(calcHours(entry, exit));
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
  setTimeout(() => { $("empleado").value = ""; }, 50);
}

async function saveOnline(record) {
  try {
    const data = new URLSearchParams();
    data.append("id", record.id);
    data.append("empleado", record.empleado);
    data.append("fecha", record.fecha);
    data.append("turno", record.turno);
    data.append("entrada", record.entrada);
    data.append("salida", record.salida);
    data.append("horas", String(record.horas));
    data.append("observaciones", record.observaciones || "");
    data.append("fechaRegistro", record.fechaRegistro);

    await fetch(`${GOOGLE_SCRIPT_URL}?t=${Date.now()}`, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: data.toString()
    });

    return true;
  } catch (error) {
    console.error("Error al guardar en Google Sheets:", error);
    return false;
  }
}

async function saveTurn() {
  const employee = $("empleado").value;
  const date = $("fecha").value;
  const shift = $("turno").value;
  const entry = normalizeTime($("entrada").value);
  const exit = normalizeTime($("salida").value);
  const observations = $("observaciones").value.trim();

  if (!employee) return showMessage("Selecciona un empleado.", false);
  if (!date) return showMessage("Selecciona la fecha.", false);
  if (!shift) return showMessage("Selecciona el turno.", false);
  if (!entry || !exit) return showMessage("Introduce correctamente entrada y salida.", false);

  const hours = calcHours(entry, exit);
  const records = loadRecords();
  const duplicate = records.some((record) =>
    record.id !== editingId &&
    record.empleado === employee &&
    record.fecha === date &&
    record.turno === shift
  );

  if (duplicate) return showMessage("Ya existe este empleado, fecha y turno.", false);

  const record = {
    id: editingId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    empleado: employee,
    fecha: date,
    turno: shift,
    entrada: entry,
    salida: exit,
    horas: hours,
    observaciones: observations,
    fechaRegistro: new Date().toISOString()
  };

  $("guardarBtn").disabled = true;
  $("guardarBtn").textContent = "Guardando...";
  showMessage("Enviando registro...", true);

  const savedOnline = await saveOnline(record);

  if (!savedOnline) {
    $("guardarBtn").disabled = false;
    $("guardarBtn").textContent = editingId ? "Guardar cambios" : "Guardar turno";
    showMessage("No se pudo conectar con Google Sheets.", false);
    return;
  }

  const index = records.findIndex((item) => item.id === editingId);
  if (index >= 0) records[index] = record;
  else records.push(record);

  saveRecords(records);
  resetForm();
  renderAll();
  showMessage("Turno guardado correctamente.", true);
}

function editRecord(id) {
  const record = loadRecords().find((item) => item.id === id);
  if (!record) return;
  editingId = id;
  $("empleado").value = record.empleado;
  $("fecha").value = record.fecha;
  $("turno").value = record.turno;
  $("entrada").value = record.entrada;
  $("salida").value = record.salida;
  $("observaciones").value = record.observaciones || "";
  updateHours();
  $("guardarBtn").textContent = "Guardar cambios";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  if (!confirm("¿Quieres borrar este registro del móvil?")) return;
  const records = loadRecords().filter((item) => item.id !== id);
  saveRecords(records);
  renderAll();
}

function renderRecords() {
  const list = $("lista");
  list.innerHTML = "";
  const records = loadRecords()
    .sort((a, b) => (b.fecha + b.entrada).localeCompare(a.fecha + a.entrada))
    .slice(0, 20);

  if (!records.length) {
    list.innerHTML = "<p>No hay registros todavía.</p>";
    return;
  }

  records.forEach((record) => {
    const node = $("registroTpl").content.cloneNode(true);
    node.querySelector(".r-empleado").textContent = record.empleado;
    node.querySelector(".r-detalle").textContent =
      `${record.fecha.split("-").reverse().join("/")} · ${record.turno} · ` +
      `${record.entrada}-${record.salida} · ${fmtHours(record.horas)} h`;
    node.querySelector(".editar").onclick = () => editRecord(record.id);
    node.querySelector(".eliminar").onclick = () => deleteRecord(record.id);
    list.appendChild(node);
  });
}

function renderSummary() {
  const employee = $("resumenEmpleado").value;
  const selectedDate = $("fecha").value || todayISO();
  const key = monthKey(selectedDate);
  const records = loadRecords().filter((record) =>
    record.empleado === employee && monthKey(record.fecha) === key
  );
  const totalHours = records.reduce((total, record) => total + Number(record.horas || 0), 0);
  $("resHoras").textContent = fmtHours(totalHours);
  $("resTurnos").textContent = records.length;
}

function exportCSV() {
  const records = loadRecords().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const header = ["ID","EMPLEADO","FECHA","TURNO","ENTRADA","SALIDA","HORAS","OBSERVACIONES","FECHA_REGISTRO"];
  const rows = records.map((record) => [
    record.id, record.empleado, record.fecha, record.turno,
    record.entrada, record.salida,
    String(record.horas).replace(".", ","),
    record.observaciones || "", record.fechaRegistro
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
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
    const text = document.createElement("span");
    text.textContent = name;
    const button = document.createElement("button");
    button.className = "danger small";
    button.textContent = "Quitar";
    button.onclick = () => {
      if (!confirm(`¿Quieres quitar a ${name}?`)) return;
      const employees = loadEmployees().filter((item) => item !== name);
      saveEmployees(employees);
      refreshEmployeeSelects();
      renderAll();
    };
    row.append(text, button);
    container.appendChild(row);
  });
}

function addEmployee() {
  const name = $("nuevoEmpleado").value.trim().toUpperCase();
  if (!name) return;
  const employees = loadEmployees();
  if (!employees.includes(name)) {
    employees.push(name);
    saveEmployees(employees);
  }
  $("nuevoEmpleado").value = "";
  refreshEmployeeSelects();
  renderAll();
}

function renderAll() {
  renderRecords();
  renderSummary();
}

$("guardarBtn").onclick = saveTurn;
$("exportarBtn").onclick = exportCSV;
$("anadirEmpleadoBtn").onclick = addEmployee;

$("entrada").addEventListener("blur", () => {
  const time = normalizeTime($("entrada").value);
  if (time) $("entrada").value = time;
  updateHours();
});

$("salida").addEventListener("blur", () => {
  const time = normalizeTime($("salida").value);
  if (time) $("salida").value = time;
  updateHours();
});

$("resumenEmpleado").onchange = renderSummary;
$("fecha").onchange = renderSummary;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  $("installBtn").classList.remove("hidden");
});

$("installBtn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error("Error Service Worker:", error);
  });
}

refreshEmployeeSelects();
resetForm();
renderAll();
