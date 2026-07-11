const $ = (id) => document.getElementById(id);

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby70Yaaovp03stM3x5QujgqOT9GzNseLCLIzj_1J2KoKUQ8eXLuTc58-Ui1Y6pVYUmDIA/exec";

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

/* =====================================================
   EMPLEADOS
===================================================== */

function loadEmployees() {
  let saved = [];

  try {
    saved = JSON.parse(
      localStorage.getItem("veramar_employees") || "[]"
    );
  } catch (error) {
    saved = [];
  }

  const combined = [
    ...DEFAULT_EMPLOYEES,
    ...(Array.isArray(saved) ? saved : [])
  ];

  return [...new Set(combined)].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function saveEmployees(list) {
  localStorage.setItem(
    "veramar_employees",
    JSON.stringify(list)
  );
}

/* =====================================================
   REGISTROS LOCALES
===================================================== */

function loadRecords() {
  try {
    const records = JSON.parse(
      localStorage.getItem("veramar_records") || "[]"
    );

    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function saveRecords(list) {
  localStorage.setItem(
    "veramar_records",
    JSON.stringify(list)
  );
}

/* =====================================================
   FECHAS Y HORAS
===================================================== */

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
  let time = String(value || "")
    .trim()
    .replace(".", ":");

  if (!time) {
    return "";
  }

  if (/^\d{1,2}$/.test(time)) {
    return `${time.padStart(2, "0")}:00`;
  }

  if (/^\d{3}$/.test(time)) {
    return `0${time.charAt(0)}:${time.slice(1)}`;
  }

  if (/^\d{4}$/.test(time)) {
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  }

  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const parts = time.split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return (
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0")
      );
    }
  }

  return "";
}

function calcHours(start, end) {
  if (!start || !end) {
    return 0;
  }

  const startParts = start.split(":").map(Number);
  const endParts = end.split(":").map(Number);

  let startMinutes =
    startParts[0] * 60 + startParts[1];

  let endMinutes =
    endParts[0] * 60 + endParts[1];

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return (endMinutes - startMinutes) / 60;
}

function fmtHours(value) {
  return Number(value || 0)
    .toFixed(2)
    .replace(".", ",");
}

/* =====================================================
   SELECTORES
===================================================== */

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

  if (
    currentSummary &&
    employees.includes(currentSummary)
  ) {
    summarySelect.value = currentSummary;
  }

  employeeSelect.value = "";

  renderEmployeeList();
}

/* =====================================================
   FORMULARIO
===================================================== */

function updateHours() {
  const entry = normalizeTime($("entrada").value);
  const exit = normalizeTime($("salida").value);

  $("horas").textContent =
    fmtHours(calcHours(entry, exit));
}

function showMessage(text, ok = true) {
  $("mensaje").textContent = text;
  $("mensaje").style.color =
    ok ? "#067647" : "#B42318";
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

  setTimeout(() => {
    $("empleado").value = "";
    $("entrada").value = "";
    $("salida").value = "";
    $("observaciones").value = "";
    $("horas").textContent = "0,00";
  }, 100);
}

/* =====================================================
   GUARDAR EN GOOGLE SHEETS
===================================================== */

async function saveOnline(record) {
  const url =
    GOOGLE_SCRIPT_URL +
    "?cache=" +
    Date.now();

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(record)
    });

    return true;
  } catch (error) {
    console.error(
      "Error al guardar en Google Sheets:",
      error
    );

    return false;
  }
}

/* =====================================================
   GUARDAR TURNO
===================================================== */

async function saveTurn() {
  const employee = $("empleado").value;
  const date = $("fecha").value;
  const shift = $("turno").value;

  const entry =
    normalizeTime($("entrada").value);

  const exit =
    normalizeTime($("salida").value);

  const observations =
    $("observaciones").value.trim();

  if (!employee) {
    showMessage(
      "Selecciona un empleado.",
      false
    );
    return;
  }

  if (!date) {
    showMessage(
      "Selecciona la fecha.",
      false
    );
    return;
  }

  if (!shift) {
    showMessage(
      "Selecciona el turno.",
      false
    );
    return;
  }

  if (!entry || !exit) {
    showMessage(
      "Introduce correctamente entrada y salida.",
      false
    );
    return;
  }

  const hours = calcHours(entry, exit);
  const records = loadRecords();

  const duplicate = records.some((record) =>
    record.id !== editingId &&
    record.empleado === employee &&
    record.fecha === date &&
    record.turno === shift
  );

  if (duplicate) {
    showMessage(
      "Ya existe este empleado, fecha y turno.",
      false
    );
    return;
  }

  const record = {
    id:
      editingId ||
      (
        Date.now().toString() +
        "-" +
        Math.random()
          .toString(36)
          .slice(2, 10)
      ),

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

  showMessage(
    "Enviando registro...",
    true
  );

  const onlineSaved =
    await saveOnline(record);

  if (!onlineSaved) {
    $("guardarBtn").disabled = false;
    $("guardarBtn").textContent =
      editingId
        ? "Guardar cambios"
        : "Guardar turno";

    showMessage(
      "No se pudo conectar con Google Sheets.",
      false
    );

    return;
  }

  const index = records.findIndex(
    (item) => item.id === editingId
  );

  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }

  saveRecords(records);

  resetForm();
  renderAll();

  showMessage(
    "Turno guardado correctamente.",
    true
  );
}

/* =====================================================
   EDITAR Y BORRAR
===================================================== */

function editRecord(id) {
  const record = loadRecords().find(
    (item) => item.id === id
  );

  if (!record) {
    return;
  }

  editingId = id;

  $("empleado").value = record.empleado;
  $("fecha").value = record.fecha;
  $("turno").value = record.turno;
  $("entrada").value = record.entrada;
  $("salida").value = record.salida;
  $("observaciones").value =
    record.observaciones || "";

  updateHours();

  $("guardarBtn").textContent =
    "Guardar cambios";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function deleteRecord(id) {
  const answer = confirm(
    "¿Quieres borrar este registro del móvil?"
  );

  if (!answer) {
    return;
  }

  const records = loadRecords().filter(
    (item) => item.id !== id
  );

  saveRecords(records);
  renderAll();
}

/* =====================================================
   ÚLTIMOS REGISTROS
===================================================== */

function renderRecords() {
  const list = $("lista");
  list.innerHTML = "";

  const records = loadRecords()
    .sort((a, b) =>
      (b.fecha + b.entrada).localeCompare(
        a.fecha + a.entrada
      )
    )
    .slice(0, 20);

  if (!records.length) {
    list.innerHTML =
      "<p>No hay registros todavía.</p>";
    return;
  }

  records.forEach((record) => {
    const node =
      $("registroTpl")
        .content
        .cloneNode(true);

    node.querySelector(
      ".r-empleado"
    ).textContent = record.empleado;

    node.querySelector(
      ".r-detalle"
    ).textContent =
      record.fecha
        .split("-")
        .reverse()
        .join("/") +
      " · " +
      record.turno +
      " · " +
      record.entrada +
      "-" +
      record.salida +
      " · " +
      fmtHours(record.horas) +
      " h";

    node.querySelector(
      ".editar"
    ).onclick = () =>
      editRecord(record.id);

    node.querySelector(
      ".eliminar"
    ).onclick = () =>
      deleteRecord(record.id);

    list.appendChild(node);
  });
}

/* =====================================================
   RESUMEN DEL MES
===================================================== */

function renderSummary() {
  const employee =
    $("resumenEmpleado").value;

  const selectedDate =
    $("fecha").value || todayISO();

  const key = monthKey(selectedDate);

  const records = loadRecords().filter(
    (record) =>
      record.empleado === employee &&
      monthKey(record.fecha) === key
  );

  const totalHours = records.reduce(
    (total, record) =>
      total + Number(record.horas || 0),
    0
  );

  $("resHoras").textContent =
    fmtHours(totalHours);

  $("resTurnos").textContent =
    records.length;
}

/* =====================================================
   EXPORTAR CSV
===================================================== */

function exportCSV() {
  const records = loadRecords().sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha)
  );

  const header = [
    "ID",
    "EMPLEADO",
    "FECHA",
    "TURNO",
    "ENTRADA",
    "SALIDA",
    "HORAS",
    "OBSERVACIONES",
    "FECHA_REGISTRO"
  ];

  const rows = records.map((record) => [
    record.id,
    record.empleado,
    record.fecha,
    record.turno,
    record.entrada,
    record.salida,
    String(record.horas).replace(".", ","),
    record.observaciones || "",
    record.fechaRegistro
  ]);

  const csv = [
    header,
    ...rows
  ]
    .map((row) =>
      row
        .map((value) =>
          `"${String(value).replaceAll(
            '"',
            '""'
          )}"`
        )
        .join(";")
    )
    .join("\n");

  const blob = new Blob(
    ["\uFEFF" + csv],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const link =
    document.createElement("a");

  link.href =
    URL.createObjectURL(blob);

  link.download =
    `veramar_turnos_${todayISO()}.csv`;

  link.click();

  URL.revokeObjectURL(link.href);
}

/* =====================================================
   GESTIÓN DE EMPLEADOS
===================================================== */

function renderEmployeeList() {
  const container =
    $("empleadosLista");

  container.innerHTML = "";

  loadEmployees().forEach((name) => {
    const row =
      document.createElement("div");

    row.className = "employee-item";

    const text =
      document.createElement("span");

    text.textContent = name;

    const button =
      document.createElement("button");

    button.className =
      "danger small";

    button.textContent =
      "Quitar";

    button.onclick = () => {
      const answer = confirm(
        `¿Quieres quitar a ${name}?`
      );

      if (!answer) {
        return;
      }

      const employees =
        loadEmployees().filter(
          (item) => item !== name
        );

      saveEmployees(employees);
      refreshEmployeeSelects();
      renderAll();
    };

    row.append(text, button);
    container.appendChild(row);
  });
}

function addEmployee() {
  const name =
    $("nuevoEmpleado")
      .value
      .trim()
      .toUpperCase();

  if (!name) {
    return;
  }

  const employees =
    loadEmployees();

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

/* =====================================================
   EVENTOS
===================================================== */

$("guardarBtn").onclick = saveTurn;
$("exportarBtn").onclick = exportCSV;
$("anadirEmpleadoBtn").onclick = addEmployee;

$("entrada").addEventListener(
  "blur",
  () => {
    const time =
      normalizeTime($("entrada").value);

    if (time) {
      $("entrada").value = time;
    }

    updateHours();
  }
);

$("salida").addEventListener(
  "blur",
  () => {
    const time =
      normalizeTime($("salida").value);

    if (time) {
      $("salida").value = time;
    }

    updateHours();
  }
);

$("resumenEmpleado").onchange =
  renderSummary;

$("fecha").onchange =
  renderSummary;

/* =====================================================
   INSTALACIÓN
===================================================== */

window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();
    deferredPrompt = event;

    $("installBtn")
      .classList
      .remove("hidden");
  }
);

$("installBtn").onclick =
  async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    deferredPrompt = null;

    $("installBtn")
      .classList
      .add("hidden");
  };

/* =====================================================
   SERVICE WORKER
===================================================== */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("sw.js")
    .catch((error) =>
      console.error(
        "Error Service Worker:",
        error
      )
    );
}

/* =====================================================
   INICIO
===================================================== */

refreshEmployeeSelects();
resetForm();
renderAll();
