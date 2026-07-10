
const $ = (id) => document.getElementById(id);

const DEFAULT_EMPLOYEES = [
  "MAR MORENO",
  "FELIPE CORDEIRO",
  "ZAKARIA",
  "ABDOU",
  "MUSA"
];

let editingId = null;
let deferredPrompt = null;

function loadEmployees(){
  const saved = JSON.parse(localStorage.getItem("veramar_employees") || "null");
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_EMPLOYEES;
}
function saveEmployees(list){
  localStorage.setItem("veramar_employees", JSON.stringify(list));
}
function loadRecords(){
  return JSON.parse(localStorage.getItem("veramar_records") || "[]");
}
function saveRecords(list){
  localStorage.setItem("veramar_records", JSON.stringify(list));
}

function normalizeTime(value){
  let t = String(value || "").trim().replace(".", ":");
  if(!t) return "";
  if(/^\d{1,2}$/.test(t)) return `${t.padStart(2,"0")}:00`;
  if(/^\d{3}$/.test(t)) return `0${t[0]}:${t.slice(1)}`;
  if(/^\d{4}$/.test(t)) return `${t.slice(0,2)}:${t.slice(2)}`;
  if(/^\d{1,2}:\d{2}$/.test(t)){
    let [h,m] = t.split(":").map(Number);
    if(h>=0 && h<=23 && m>=0 && m<=59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return "";
}
function calcHours(start,end){
  if(!start || !end) return 0;
  const [sh,sm] = start.split(":").map(Number);
  const [eh,em] = end.split(":").map(Number);
  let a = sh*60+sm, b = eh*60+em;
  if(b<a) b += 24*60;
  return (b-a)/60;
}
function fmtHours(n){ return Number(n||0).toFixed(2).replace(".",","); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function monthKey(date){ return date.slice(0,7); }

function refreshEmployeeSelects(){
  const employees = loadEmployees();
  for(const id of ["empleado","resumenEmpleado"]){
    const sel = $(id);
    const current = sel.value;
    sel.innerHTML = "";
    employees.forEach(name=>{
      const o=document.createElement("option");o.value=name;o.textContent=name;sel.appendChild(o);
    });
    if(employees.includes(current)) sel.value=current;
  }
  renderEmployeeList();
}
function updateHours(){
  const e = normalizeTime($("entrada").value);
  const s = normalizeTime($("salida").value);
  $("horas").textContent = fmtHours(calcHours(e,s));
}
function showMessage(text,ok=true){
  $("mensaje").textContent=text;
  $("mensaje").style.color=ok?"#067647":"#B42318";
}
function resetForm(){
  editingId=null;
  $("fecha").value=todayISO();
  $("turno").value="COMIDA";
  $("entrada").value="";
  $("salida").value="";
  $("observaciones").value="";
  $("horas").textContent="0,00";
  $("guardarBtn").textContent="Guardar turno";
}
function saveTurn(){
  const empleado=$("empleado").value;
  const fecha=$("fecha").value;
  const turno=$("turno").value;
  const entrada=normalizeTime($("entrada").value);
  const salida=normalizeTime($("salida").value);
  const observaciones=$("observaciones").value.trim();

  if(!empleado || !fecha || !entrada || !salida){
    showMessage("Completa empleado, fecha, entrada y salida.",false); return;
  }
  const horas=calcHours(entrada,salida);
  const records=loadRecords();

  const duplicate=records.some(r =>
    r.id!==editingId && r.empleado===empleado && r.fecha===fecha && r.turno===turno
  );
  if(duplicate){
    showMessage("Ya existe ese empleado, fecha y turno.",false); return;
  }

  const item={
    id: editingId || crypto.randomUUID(),
    empleado,fecha,turno,entrada,salida,horas,observaciones,
    fechaRegistro:new Date().toISOString()
  };
  const idx=records.findIndex(r=>r.id===editingId);
  if(idx>=0) records[idx]=item; else records.push(item);
  saveRecords(records);
  showMessage(idx>=0?"Registro modificado.":"Turno guardado.");
  resetForm();
  renderAll();
}
function editRecord(id){
  const r=loadRecords().find(x=>x.id===id);
  if(!r) return;
  editingId=id;
  $("empleado").value=r.empleado;
  $("fecha").value=r.fecha;
  $("turno").value=r.turno;
  $("entrada").value=r.entrada;
  $("salida").value=r.salida;
  $("observaciones").value=r.observaciones||"";
  updateHours();
  $("guardarBtn").textContent="Guardar cambios";
  window.scrollTo({top:0,behavior:"smooth"});
}
function deleteRecord(id){
  if(!confirm("¿Borrar este registro?")) return;
  saveRecords(loadRecords().filter(r=>r.id!==id));
  renderAll();
}
function renderRecords(){
  const list=$("lista");
  list.innerHTML="";
  const records=loadRecords().sort((a,b)=> (b.fecha+b.entrada).localeCompare(a.fecha+a.entrada)).slice(0,20);
  if(!records.length){ list.innerHTML="<p>No hay registros todavía.</p>"; return; }
  records.forEach(r=>{
    const node=$("registroTpl").content.cloneNode(true);
    node.querySelector(".r-empleado").textContent=r.empleado;
    node.querySelector(".r-detalle").textContent=`${r.fecha.split("-").reverse().join("/")} · ${r.turno} · ${r.entrada}-${r.salida} · ${fmtHours(r.horas)} h`;
    node.querySelector(".editar").onclick=()=>editRecord(r.id);
    node.querySelector(".eliminar").onclick=()=>deleteRecord(r.id);
    list.appendChild(node);
  });
}
function renderSummary(){
  const employee=$("resumenEmpleado").value;
  const key=monthKey($("fecha").value || todayISO());
  const rows=loadRecords().filter(r=>r.empleado===employee && monthKey(r.fecha)===key);
  $("resHoras").textContent=fmtHours(rows.reduce((s,r)=>s+Number(r.horas||0),0));
  $("resTurnos").textContent=rows.length;
}
function exportCSV(){
  const rows=loadRecords().sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const header=["ID","EMPLEADO","FECHA","TURNO","ENTRADA","SALIDA","HORAS","OBSERVACIONES","FECHA_REGISTRO"];
  const csv=[header.join(";"),...rows.map(r=>[
    r.id,r.empleado,r.fecha,r.turno,r.entrada,r.salida,
    String(r.horas).replace(".",","),r.observaciones||"",r.fechaRegistro
  ].map(v=>`"${String(v).replaceAll('"','""')}"`).join(";"))].join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`veramar_turnos_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function renderEmployeeList(){
  const wrap=$("empleadosLista"); wrap.innerHTML="";
  loadEmployees().forEach(name=>{
    const div=document.createElement("div");div.className="employee-item";
    const span=document.createElement("span");span.textContent=name;
    const btn=document.createElement("button");btn.className="danger small";btn.textContent="Quitar";
    btn.onclick=()=>{
      if(!confirm(`¿Quitar a ${name}?`)) return;
      const next=loadEmployees().filter(x=>x!==name);
      saveEmployees(next);refreshEmployeeSelects();renderAll();
    };
    div.append(span,btn);wrap.appendChild(div);
  });
}
function addEmployee(){
  const name=$("nuevoEmpleado").value.trim().toUpperCase();
  if(!name) return;
  const list=loadEmployees();
  if(!list.includes(name)){list.push(name);saveEmployees(list);}
  $("nuevoEmpleado").value="";
  refreshEmployeeSelects();renderAll();
}
function renderAll(){ renderRecords(); renderSummary(); }

$("guardarBtn").onclick=saveTurn;
$("exportarBtn").onclick=exportCSV;
$("anadirEmpleadoBtn").onclick=addEmployee;
$("entrada").addEventListener("blur",()=>{const t=normalizeTime($("entrada").value); if(t)$("entrada").value=t; updateHours();});
$("salida").addEventListener("blur",()=>{const t=normalizeTime($("salida").value); if(t)$("salida").value=t; updateHours();});
$("resumenEmpleado").onchange=renderSummary;
$("fecha").onchange=renderSummary;

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredPrompt=e; $("installBtn").classList.remove("hidden");
});
$("installBtn").onclick=async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  $("installBtn").classList.add("hidden");
};

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

$("fecha").value=todayISO();
refreshEmployeeSelects();
resetForm();
renderAll();
