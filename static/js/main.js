const API_URL = "/api/gastos";

// Cambia el código de moneda si lo necesitas (COP, USD, EUR, MXN...)
const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
});

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const form = document.getElementById("form-gasto");
const inputFecha = document.getElementById("fecha");
const inputConcepto = document.getElementById("concepto");
const inputMonto = document.getElementById("monto");
const selectCategoria = document.getElementById("categoria");
const inputDesde = document.getElementById("desde");
const inputHasta = document.getElementById("hasta");
const btnMes = document.getElementById("btn-mes");
const btnTodo = document.getElementById("btn-todo");
const mensaje = document.getElementById("mensaje");
const lista = document.getElementById("lista-gastos");
const vacio = document.getElementById("vacio");
const totalEl = document.getElementById("total");
const cantidadEl = document.getElementById("cantidad");
const btnHistorial = document.getElementById("btn-historial");
const contenidoHistorial = document.getElementById("contenido-historial");
const botonEnviar = form.querySelector("button[type='submit']");

let gastos = [];              // todos los gastos que devuelve la API
let historialVisible = false; // el historial empieza oculto

function aISO(d) {
  // Fecha local en formato AAAA-MM-DD (toISOString usaría UTC y podría dar el día siguiente)
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function hoy() {
  return aISO(new Date());
}

function ponerRangoDelMes() {
  const ahora = new Date();
  inputDesde.value = aISO(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
  inputHasta.value = aISO(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));
}

function mostrarError(texto) {
  mensaje.textContent = texto;
  mensaje.hidden = !texto;
}

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return formatoFecha.format(new Date(a, m - 1, d));
}

function rangoInvalido() {
  return Boolean(inputDesde.value && inputHasta.value && inputDesde.value > inputHasta.value);
}

function gastosDelPeriodo() {
  if (rangoInvalido()) return [];
  const desde = inputDesde.value; // vacío = sin límite
  const hasta = inputHasta.value;
  // Las fechas ISO (AAAA-MM-DD) se pueden comparar como texto
  return gastos.filter((g) => (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta));
}

function descripcionPeriodo() {
  const desde = inputDesde.value;
  const hasta = inputHasta.value;
  if (desde && hasta) return `del ${fechaLegible(desde)} al ${fechaLegible(hasta)}`;
  if (desde) return `desde el ${fechaLegible(desde)}`;
  if (hasta) return `hasta el ${fechaLegible(hasta)}`;
  return "";
}

function ampliarRango(fecha) {
  if (inputDesde.value && fecha < inputDesde.value) inputDesde.value = fecha;
  if (inputHasta.value && fecha > inputHasta.value) inputHasta.value = fecha;
}

function crearItem(gasto) {
  const li = document.createElement("li");
  li.className = "gasto";

  const info = document.createElement("div");
  const concepto = document.createElement("p");
  concepto.className = "gasto-concepto";
  concepto.textContent = gasto.concepto; // textContent evita inyectar HTML
  const meta = document.createElement("p");
  meta.className = "gasto-meta";
  meta.textContent = `${gasto.categoria} · ${fechaLegible(gasto.fecha)}`;
  info.append(concepto, meta);

  const monto = document.createElement("span");
  monto.className = "gasto-monto";
  monto.textContent = formatoMoneda.format(gasto.monto);

  const eliminar = document.createElement("button");
  eliminar.type = "button";
  eliminar.className = "btn-eliminar";
  eliminar.textContent = "Eliminar";
  eliminar.setAttribute("aria-label", `Eliminar gasto: ${gasto.concepto}`);
  eliminar.addEventListener("click", () => eliminarGasto(gasto.id));

  li.append(info, monto, eliminar);
  return li;
}

function textoCantidad(n) {
  if (rangoInvalido()) return "La fecha «Desde» es posterior a «Hasta». Corrige el rango.";
  const periodo = descripcionPeriodo();
  if (n === 0) return periodo ? `Sin gastos ${periodo}` : "Sin gastos registrados";
  const cantidad = `${n} ${n === 1 ? "gasto" : "gastos"}`;
  return periodo ? `${cantidad} ${periodo}` : `${cantidad} en total`;
}

function renderizar() {
  const visibles = gastosDelPeriodo();

  // Total del rango seleccionado
  const total = visibles.reduce((suma, g) => suma + g.monto, 0);
  totalEl.textContent = formatoMoneda.format(total);
  cantidadEl.textContent = textoCantidad(visibles.length);

  // Historial (solo se ve si la persona lo pide)
  lista.replaceChildren(...visibles.map(crearItem));
  vacio.hidden = visibles.length > 0;
  contenidoHistorial.hidden = !historialVisible;
  btnHistorial.setAttribute("aria-expanded", String(historialVisible));
  btnHistorial.textContent = historialVisible
    ? "Ocultar historial"
    : `Ver historial (${visibles.length})`;
}

async function cargarGastos() {
  try {
    const respuesta = await fetch(API_URL);
    if (!respuesta.ok) throw new Error();
    gastos = await respuesta.json();
    renderizar();
  } catch {
    mostrarError("No se pudieron cargar los gastos. Verifica que el servidor esté activo.");
  }
}

async function agregarGasto(evento) {
  evento.preventDefault();
  mostrarError("");

  const concepto = inputConcepto.value.trim();
  const monto = parseFloat(inputMonto.value);

  if (!inputFecha.value) return mostrarError("Elige una fecha.");
  if (!concepto) return mostrarError("Escribe un concepto.");
  if (!Number.isFinite(monto) || monto <= 0) {
    return mostrarError("Ingresa un monto mayor que cero.");
  }

  botonEnviar.disabled = true;
  try {
    const respuesta = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: inputFecha.value,
        concepto,
        monto,
        categoria: selectCategoria.value,
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo guardar el gasto.");

    inputConcepto.value = "";
    inputMonto.value = "";
    inputConcepto.focus();
    ampliarRango(inputFecha.value); // si cae fuera del rango, se amplía para que se vea
    await cargarGastos();
  } catch (error) {
    mostrarError(error.message || "No se pudo guardar el gasto.");
  } finally {
    botonEnviar.disabled = false;
  }
}

async function eliminarGasto(id) {
  mostrarError("");
  try {
    const respuesta = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    if (!respuesta.ok) throw new Error();
    await cargarGastos();
  } catch {
    mostrarError("No se pudo eliminar el gasto. Inténtalo de nuevo.");
  }
}

/* ===================== Importar extracto CSV ===================== */
const inputCSV = document.getElementById("archivo-csv");
const btnElegirCSV = document.getElementById("btn-elegir-csv");
const msgImportar = document.getElementById("msg-importar");
const detalleImportar = document.getElementById("importar-detalle");
const colFecha = document.getElementById("col-fecha");
const colConcepto = document.getElementById("col-concepto");
const colMonto = document.getElementById("col-monto");
const formatoFechaCSV = document.getElementById("formato-fecha");
const modoMonto = document.getElementById("modo-monto");
const resumenImportar = document.getElementById("resumen-importar");
const listaImportar = document.getElementById("lista-importar");
const btnConfirmarImportar = document.getElementById("btn-confirmar-importar");
const btnCancelarImportar = document.getElementById("btn-cancelar-importar");

let datosCSV = null;       // { encabezados, filas } del archivo cargado
let filasImportar = [];    // movimientos propuestos para importar
let omitidasImportar = 0;  // ingresos o filas no válidas

const REGLAS_CATEGORIA = [
  ["Alimentación", ["rappi", "exito", "carulla", "jumbo", "olimpica", "d1", "ara", "restaurante", "mercado", "supermercado", "panaderia", "cafe", "pizza", "mcdonalds", "kfc", "frisby", "corral", "domicilio", "tienda"]],
  ["Transporte", ["uber", "didi", "cabify", "indriver", "beat", "gasolina", "terpel", "primax", "peaje", "parqueadero", "taxi", "transmilenio", "metro", "sitp"]],
  ["Servicios", ["epm", "claro", "movistar", "tigo", "wom", "etb", "vanti", "enel", "codensa", "acueducto", "energia", "internet", "celular"]],
  ["Vivienda", ["arriendo", "administracion", "predial", "hipoteca", "alquiler"]],
  ["Salud", ["farmacia", "drogueria", "farmatodo", "cruz verde", "eps", "clinica", "hospital", "medico", "laboratorio", "odontologia"]],
  ["Ocio", ["netflix", "spotify", "cine", "cinemark", "procinal", "disney", "hbo", "prime video", "steam", "playstation", "bar", "concierto", "tiquetera"]],
  ["Educación", ["universidad", "colegio", "curso", "udemy", "coursera", "libreria", "matricula"]],
].map(([categoria, palabras]) => [
  categoria,
  new RegExp(`(^|[^a-z0-9])(${palabras.join("|")})([^a-z0-9]|$)`),
]);

function normalizar(texto) {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function categoriaSugerida(concepto) {
  const t = normalizar(concepto);
  const regla = REGLAS_CATEGORIA.find(([, re]) => re.test(t));
  return regla ? regla[0] : "Otros";
}

function mostrarMensajeImportar(texto, esError) {
  msgImportar.textContent = texto;
  msgImportar.hidden = !texto;
  msgImportar.classList.toggle("mensaje-ok", !esError);
}

/* ---- Lectura del CSV ---- */
function detectarDelimitador(texto) {
  const muestra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const opciones = [";", "\t", ","].map((c) => [c, muestra.split(c).length - 1]);
  opciones.sort((a, b) => b[1] - a[1]);
  return opciones[0][1] > 0 ? opciones[0][0] : ",";
}

function parsearCSV(texto, delim) {
  const filas = [];
  let fila = [];
  let celda = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else enComillas = false;
      } else celda += c;
    } else if (c === '"') enComillas = true;
    else if (c === delim) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

function indiceEncabezado(filas) {
  // El encabezado es la primera fila con 3+ celdas y sin valores numéricos ni fechas
  // (los bancos suelen poner líneas de título antes de la tabla).
  const pareceNumero = (t) => /\d/.test(t) && /^[\s$()+\-\d.,/:]+$/.test(t);
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const llenas = filas[i].map((c) => String(c ?? "").trim()).filter(Boolean);
    if (llenas.length >= 3 && !llenas.some(pareceNumero)) return i;
  }
  return 0;
}

function parsearFecha(texto, formato) {
  const t = String(texto).trim().split(/[\sT]/)[0];
  let a, m, d;
  let r = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (r) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    a = +r[3] < 100 ? 2000 + +r[3] : +r[3];
    if (formato === "mdy") { m = +r[1]; d = +r[2]; } else { d = +r[1]; m = +r[2]; }
  } else return null;
  const f = new Date(a, m - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
  return aISO(f);
}

function parsearMonto(texto) {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null; // celdas numéricas de Excel
  let t = String(texto).trim();
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.includes("-")) negativo = true;
  t = t.replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;
  const punto = t.lastIndexOf(".");
  const coma = t.lastIndexOf(",");
  let decimal = null;
  if (punto !== -1 && coma !== -1) decimal = punto > coma ? "." : ",";
  else if (punto !== -1 || coma !== -1) {
    const sep = punto !== -1 ? "." : ",";
    const partes = t.split(sep);
    // Un solo separador seguido de 3 dígitos es de miles (36.000); si no, es decimal (12,50)
    if (partes.length === 2 && (partes[1].length !== 3 || partes[0] === "0")) decimal = sep;
  }
  let limpio;
  if (decimal) {
    const i = t.lastIndexOf(decimal);
    limpio = t.slice(0, i).replace(/[.,]/g, "") + "." + t.slice(i + 1).replace(/[.,]/g, "");
  } else limpio = t.replace(/[.,]/g, "");
  const n = parseFloat(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

function autodetectarColumnas() {
  const { encabezados, filas } = datosCSV;
  const norm = encabezados.map(normalizar);
  const muestra = filas.slice(0, 50);
  const valores = (i) => muestra.map((f) => String(f[i] ?? "").trim());
  const buscar = (re, excluir) => norm.findIndex((h, i) => re.test(h) && !excluir.includes(i));
  const mejor = (puntaje, excluir, minimo) => {
    let idx = -1;
    let max = minimo;
    encabezados.forEach((_, i) => {
      if (excluir.includes(i)) return;
      const p = puntaje(i);
      if (p > max) { max = p; idx = i; }
    });
    return idx;
  };
  const ratio = (i, prueba) => valores(i).filter(prueba).length / muestra.length;

  let fecha = buscar(/fecha|date/, []);
  if (fecha < 0) fecha = mejor((i) => ratio(i, (v) => parsearFecha(v, "dmy")), [], 0.5);
  let monto = buscar(/valor|monto|importe|debito|cargo|retiro|egreso|amount/, [fecha]);
  if (monto < 0) monto = mejor((i) => ratio(i, (v) => parsearMonto(v) !== null), [fecha], 0.5);
  let concepto = buscar(/descrip|concepto|detalle|referencia|movimiento|comercio|description/, [fecha, monto]);
  if (concepto < 0) {
    concepto = mejor((i) => valores(i).reduce((s, v) => s + v.length, 0) / muestra.length, [fecha, monto], 0);
  }
  return { fecha: Math.max(fecha, 0), concepto: Math.max(concepto, 0), monto: Math.max(monto, 0) };
}

function llenarSelectoresColumnas() {
  [colFecha, colConcepto, colMonto].forEach((sel) => {
    sel.replaceChildren(
      ...datosCSV.encabezados.map((h, i) => new Option(h || `Columna ${i + 1}`, String(i)))
    );
  });
}

function procesarTextoCSV(texto) {
  texto = texto.replace(/^\uFEFF/, "");
  procesarFilas(parsearCSV(texto, detectarDelimitador(texto)));
}

// Recibe la tabla ya separada en filas (viene de un CSV o de un Excel)
function procesarFilas(filas) {
  const inicio = indiceEncabezado(filas);
  const encabezados = (filas[inicio] || []).map((h) => String(h ?? "").trim());
  const datos = filas.slice(inicio + 1);
  if (encabezados.length < 3 || datos.length === 0) {
    throw new Error("No se encontró una tabla de movimientos en el archivo.");
  }
  datosCSV = { encabezados, filas: datos };
  llenarSelectoresColumnas();

  const cols = autodetectarColumnas();
  colFecha.value = String(cols.fecha);
  colConcepto.value = String(cols.concepto);
  colMonto.value = String(cols.monto);

  // ¿Mes/Día/Año? Si algún segundo número supera 12 y ningún primero lo hace.
  const partes = datos.map((f) => String(f[cols.fecha] ?? "").trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/)).filter(Boolean);
  const mdy = partes.some((p) => +p[2] > 12) && !partes.some((p) => +p[1] > 12);
  formatoFechaCSV.value = mdy ? "mdy" : "dmy";

  const hayNegativos = datos.some((f) => (parsearMonto(f[cols.monto] || "") ?? 0) < 0);
  modoMonto.value = hayNegativos ? "negativos" : "todos";

  construirFilasImportar();
}

/* ---- Vista previa ---- */
function claveGasto(fecha, concepto, monto) {
  return `${fecha}|${String(concepto).trim().toLowerCase()}|${Number(monto).toFixed(2)}`;
}

function construirFilasImportar() {
  if (!datosCSV) return;
  const iF = +colFecha.value;
  const iC = +colConcepto.value;
  const iM = +colMonto.value;

  // Gastos ya registrados (se cuentan para no marcar de más compras idénticas)
  const registrados = new Map();
  gastos.forEach((g) => {
    const k = claveGasto(g.fecha, g.concepto, g.monto);
    registrados.set(k, (registrados.get(k) || 0) + 1);
  });

  filasImportar = [];
  omitidasImportar = 0;
  for (const f of datosCSV.filas) {
    const fecha = parsearFecha(f[iF] || "", formatoFechaCSV.value);
    const valor = parsearMonto(f[iM] || "");
    const esIngreso = modoMonto.value === "negativos" && valor > 0;
    if (!fecha || valor === null || valor === 0 || esIngreso) { omitidasImportar++; continue; }

    const concepto = String(f[iC] ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Sin descripción";
    const monto = Math.abs(valor);
    const clave = claveGasto(fecha, concepto, monto);
    const duplicado = (registrados.get(clave) || 0) > 0;
    if (duplicado) registrados.set(clave, registrados.get(clave) - 1);
    filasImportar.push({
      incluir: !duplicado, fecha, concepto, monto, duplicado,
      categoria: categoriaSugerida(concepto),
    });
  }
  renderizarImportar();
}

function crearFilaImportar(fila) {
  const li = document.createElement("li");
  li.className = "gasto fila-importar";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = fila.incluir;
  check.setAttribute("aria-label", `Importar: ${fila.concepto}`);
  check.addEventListener("change", () => { fila.incluir = check.checked; actualizarResumenImportar(); });

  const info = document.createElement("div");
  const concepto = document.createElement("p");
  concepto.className = "gasto-concepto";
  concepto.textContent = fila.concepto;
  const meta = document.createElement("p");
  meta.className = "gasto-meta";
  meta.textContent = fechaLegible(fila.fecha) + (fila.duplicado ? " · Ya registrado" : "");
  info.append(concepto, meta);

  const monto = document.createElement("span");
  monto.className = "gasto-monto";
  monto.textContent = formatoMoneda.format(fila.monto);

  const categoria = document.createElement("select");
  categoria.setAttribute("aria-label", `Categoría de ${fila.concepto}`);
  categoria.replaceChildren(...Array.from(selectCategoria.options, (o) => new Option(o.text, o.value)));
  categoria.value = fila.categoria;
  categoria.addEventListener("change", () => { fila.categoria = categoria.value; });

  li.append(check, info, monto, categoria);
  return li;
}

function actualizarResumenImportar() {
  const elegidas = filasImportar.filter((f) => f.incluir);
  const total = elegidas.reduce((s, f) => s + f.monto, 0);
  const ya = filasImportar.filter((f) => f.duplicado).length;
  const partes = [`Se importarán ${elegidas.length} ${elegidas.length === 1 ? "gasto" : "gastos"} por ${formatoMoneda.format(total)}.`];
  if (ya) partes.push(`Ya registrados: ${ya}.`);
  if (omitidasImportar) partes.push(`Omitidas (ingresos o filas no válidas): ${omitidasImportar}.`);
  resumenImportar.textContent = partes.join(" ");
  btnConfirmarImportar.disabled = elegidas.length === 0;
}

function renderizarImportar() {
  listaImportar.replaceChildren(...filasImportar.map(crearFilaImportar));
  actualizarResumenImportar();
}

function cerrarImportacion() {
  detalleImportar.hidden = true;
  datosCSV = null;
  filasImportar = [];
  listaImportar.replaceChildren();
}

async function leerTexto(archivo) {
  const buffer = await archivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer); // extractos antiguos (tildes)
  }
}

async function leerExcel(archivo) {
  const datos = new FormData();
  datos.append("archivo", archivo);
  const respuesta = await fetch(`${API_URL}/importar/excel`, { method: "POST", body: datos });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || "No se pudo leer el Excel. Reinicia el servidor con el app.py más reciente.");
  }
  return cuerpo.filas;
}

async function cargarArchivo(archivo) {
  const nombre = archivo.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls)$/.test(nombre)) procesarFilas(await leerExcel(archivo));
  else if (nombre.endsWith(".pdf")) {
    throw new Error("Los PDF todavía no son compatibles. Descarga el extracto en CSV o Excel.");
  } else procesarTextoCSV(await leerTexto(archivo));
}

async function confirmarImportacion() {
  const elegidas = filasImportar.filter((f) => f.incluir);
  if (elegidas.length === 0) return;
  btnConfirmarImportar.disabled = true;
  try {
    const respuesta = await fetch(`${API_URL}/importar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gastos: elegidas.map(({ fecha, concepto, monto, categoria }) => ({ fecha, concepto, monto, categoria })),
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo importar el archivo.");

    elegidas.forEach((f) => ampliarRango(f.fecha));
    cerrarImportacion();
    await cargarGastos();
    let texto = `Se importaron ${datos.importados} ${datos.importados === 1 ? "gasto" : "gastos"}.`;
    if (datos.duplicados) texto += ` Se omitieron ${datos.duplicados} que ya estaban registrados.`;
    mostrarMensajeImportar(texto, false);
  } catch (error) {
    mostrarMensajeImportar(error.message || "No se pudo importar el archivo.", true);
    btnConfirmarImportar.disabled = false;
  }
}

btnElegirCSV.addEventListener("click", () => inputCSV.click());
inputCSV.addEventListener("change", async () => {
  const archivo = inputCSV.files[0];
  if (!archivo) return;
  mostrarMensajeImportar("", false);
  try {
    await cargarArchivo(archivo);
    detalleImportar.hidden = false;
  } catch (error) {
    cerrarImportacion();
    mostrarMensajeImportar(error.message || "No se pudo leer el archivo.", true);
  } finally {
    inputCSV.value = ""; // permite volver a elegir el mismo archivo
  }
});
[colFecha, colConcepto, colMonto, formatoFechaCSV, modoMonto].forEach((el) =>
  el.addEventListener("change", construirFilasImportar)
);
btnConfirmarImportar.addEventListener("click", confirmarImportacion);
btnCancelarImportar.addEventListener("click", () => { cerrarImportacion(); mostrarMensajeImportar("", false); });

inputFecha.value = hoy();
ponerRangoDelMes();
form.addEventListener("submit", agregarGasto);
inputDesde.addEventListener("change", renderizar);
inputHasta.addEventListener("change", renderizar);
btnMes.addEventListener("click", () => {
  ponerRangoDelMes();
  renderizar();
});
btnTodo.addEventListener("click", () => {
  inputDesde.value = "";
  inputHasta.value = "";
  renderizar();
});
btnHistorial.addEventListener("click", () => {
  historialVisible = !historialVisible;
  renderizar();
});
cargarGastos();