const API_URL = "/api/gastos";
const BANCOS_URL = "/api/bancos";
const CATEGORIA_RETIROS = "Retiros y avances";
const CATEGORIAS_URL = "/api/categorias";

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
const selectBanco = document.getElementById("banco");
const filtroBanco = document.getElementById("filtro-banco");
const btnAnio = document.getElementById("btn-anio");
const panelBancos = document.getElementById("panel-bancos");
const formBanco = document.getElementById("form-banco");
const inputNuevoBanco = document.getElementById("nuevo-banco");
const msgBanco = document.getElementById("msg-banco");
const listaBancos = document.getElementById("lista-bancos");
const vacioBancos = document.getElementById("vacio-bancos");
let bancos = []; // bancos creados por la persona
let vistaHistorial = "general"; // "general" o "banco"
const inputDescripcion = document.getElementById("descripcion");
const campoDescripcion = document.getElementById("campo-descripcion");
const avisoPendientes = document.getElementById("aviso-pendientes");
const textoPendientes = document.getElementById("texto-pendientes");
const asignarBanco = document.getElementById("asignar-banco");
const btnAsignarBanco = document.getElementById("btn-asignar-banco");
const btnVistaGeneral = document.getElementById("vista-general");
const btnVistaBanco = document.getElementById("vista-banco");
const gruposHistorial = document.getElementById("grupos-historial");
const formCategoria = document.getElementById("form-categoria");
const inputNuevaCategoria = document.getElementById("nueva-categoria");
const msgCategoria = document.getElementById("msg-categoria");
const listaCategorias = document.getElementById("lista-categorias");
let categorias = []; // [{ id, nombre, protegida }]

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

function ponerRangoDelAnio() {
  const anio = new Date().getFullYear();
  inputDesde.value = `${anio}-01-01`;
  inputHasta.value = `${anio}-12-31`;
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

function coincideBanco(gasto, filtro) {
  if (filtro === "todos") return true;
  if (filtro === "ninguno") return gasto.banco_id == null;
  return String(gasto.banco_id) === filtro;
}

function gastosDelPeriodo() {
  if (rangoInvalido()) return [];
  const desde = inputDesde.value; // vacío = sin límite
  const hasta = inputHasta.value;
  // Las fechas ISO (AAAA-MM-DD) se pueden comparar como texto
  const banco = filtroBanco.value;
  return gastos.filter(
    (g) => (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta) && coincideBanco(g, banco)
  );
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

function crearEditorDescripcion(gasto) {
  const f = document.createElement("form");
  f.className = "editor-descripcion";
  f.hidden = true;
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 200;
  input.value = gasto.descripcion || "";
  input.placeholder = "¿En qué se usó este dinero?";
  input.setAttribute("aria-label", `Descripción de: ${gasto.concepto}`);
  const guardar = document.createElement("button");
  guardar.type = "submit";
  guardar.className = "btn-secundario";
  guardar.textContent = "Guardar";
  const cancelar = document.createElement("button");
  cancelar.type = "button";
  cancelar.className = "enlace";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", () => { f.hidden = true; input.value = gasto.descripcion || ""; });
  f.addEventListener("submit", (e) => { e.preventDefault(); guardarDescripcion(gasto.id, input.value.trim()); });
  f.append(input, guardar, cancelar);
  return f;
}

async function actualizarGasto(id, cambios) {
  mostrarError("");
  try {
    const respuesta = await fetch(`${API_URL}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudo guardar el cambio. Reinicia el servidor con el app.py más reciente.");
    }
    await cargarGastos();
  } catch (error) {
    mostrarError(error.message);
  }
}

const guardarDescripcion = (id, descripcion) => actualizarGasto(id, { descripcion });

function crearEditorCategoria(gasto) {
  const f = document.createElement("form");
  f.className = "editor-descripcion";
  f.hidden = true;
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", `Categoría de: ${gasto.concepto}`);
  const nombres = categorias.map((c) => c.nombre);
  if (!nombres.includes(gasto.categoria)) nombres.push(gasto.categoria);
  sel.replaceChildren(...nombres.map((n) => new Option(n, n)));
  sel.value = gasto.categoria;
  const guardar = document.createElement("button");
  guardar.type = "submit";
  guardar.className = "btn-secundario";
  guardar.textContent = "Guardar";
  const cancelar = document.createElement("button");
  cancelar.type = "button";
  cancelar.className = "enlace";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", () => { f.hidden = true; sel.value = gasto.categoria; });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    if (sel.value === gasto.categoria) { f.hidden = true; return; }
    actualizarGasto(gasto.id, { categoria: sel.value });
  });
  f.append(sel, guardar, cancelar);
  return f;
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
  meta.textContent = `${gasto.categoria} · ${fechaLegible(gasto.fecha)}${gasto.banco ? ` · ${gasto.banco}` : ""}`;
  info.append(concepto, meta);

  const esRetiro = gasto.categoria === CATEGORIA_RETIROS;
  if (esRetiro && gasto.descripcion) {
    const desc = document.createElement("p");
    desc.className = "gasto-descripcion";
    desc.textContent = gasto.descripcion;
    info.append(desc);
  }

  // Acciones del gasto: cada una abre su propio editor debajo
  const acciones = document.createElement("div");
  acciones.className = "gasto-acciones";
  const editores = [];
  const agregarAccion = (texto, editor) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "enlace";
    boton.textContent = texto;
    boton.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      if (!editor.hidden) editor.querySelector("input, select").focus();
    });
    acciones.append(boton);
    editores.push(editor);
  };
  agregarAccion("Cambiar categoría", crearEditorCategoria(gasto));
  // Los retiros y avances pueden llevar una descripción (qué se hizo con el dinero)
  if (esRetiro) {
    agregarAccion(gasto.descripcion ? "Editar descripción" : "Agregar descripción", crearEditorDescripcion(gasto));
  }
  info.append(acciones);

  const monto = document.createElement("span");
  monto.className = "gasto-monto";
  monto.textContent = formatoMoneda.format(gasto.monto);

  const eliminar = document.createElement("button");
  eliminar.type = "button";
  eliminar.className = "btn-eliminar";
  eliminar.textContent = "Eliminar";
  eliminar.setAttribute("aria-label", `Eliminar gasto: ${gasto.concepto}`);
  eliminar.addEventListener("click", () => eliminarGasto(gasto.id));

  li.append(info, monto, eliminar, ...editores);
  return li;
}

function frasesBanco() {
  const v = filtroBanco.value;
  if (v === "todos") return "";
  if (v === "ninguno") return "sin banco";
  const banco = bancos.find((b) => String(b.id) === v);
  return banco ? `en ${banco.nombre}` : "";
}

function textoCantidad(n) {
  if (rangoInvalido()) return "La fecha «Desde» es posterior a «Hasta». Corrige el rango.";
  const filtros = [descripcionPeriodo(), frasesBanco()].filter(Boolean).join(" ");
  if (n === 0) return filtros ? `Sin gastos ${filtros}` : "Sin gastos registrados";
  const cantidad = `${n} ${n === 1 ? "gasto" : "gastos"}`;
  return filtros ? `${cantidad} ${filtros}` : `${cantidad} en total`;
}

function renderizarHistorial(visibles) {
  const porBanco = vistaHistorial === "banco";
  lista.hidden = porBanco;
  gruposHistorial.hidden = !porBanco;
  btnVistaGeneral.setAttribute("aria-pressed", String(!porBanco));
  btnVistaBanco.setAttribute("aria-pressed", String(porBanco));
  if (!porBanco) {
    lista.replaceChildren(...visibles.map(crearItem));
    gruposHistorial.replaceChildren();
    return;
  }
  lista.replaceChildren();
  const grupos = new Map();
  visibles.forEach((g) => {
    const k = g.banco_id ?? null;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(g);
  });
  const orden = [...bancos.map((b) => b.id), null].filter((k) => grupos.has(k));
  gruposHistorial.replaceChildren(
    ...orden.map((k) => {
      const items = grupos.get(k);
      const total = items.reduce((s, g) => s + g.monto, 0);
      const seccion = document.createElement("section");
      seccion.className = "grupo-banco";
      const cabecera = document.createElement("div");
      cabecera.className = "grupo-cabecera";
      const titulo = document.createElement("h3");
      titulo.textContent = k === null ? "Sin banco asignado" : bancos.find((b) => b.id === k)?.nombre ?? "Banco";
      const resumen = document.createElement("span");
      resumen.className = "grupo-total";
      resumen.textContent = `${items.length} ${items.length === 1 ? "gasto" : "gastos"} · ${formatoMoneda.format(total)}`;
      cabecera.append(titulo, resumen);
      const ul = document.createElement("ul");
      ul.className = "lista";
      ul.append(...items.map(crearItem));
      seccion.append(cabecera, ul);
      return seccion;
    })
  );
}

function renderizar() {
  const visibles = gastosDelPeriodo();

  // Total del rango seleccionado
  const total = visibles.reduce((suma, g) => suma + g.monto, 0);
  totalEl.textContent = formatoMoneda.format(total);
  cantidadEl.textContent = textoCantidad(visibles.length);

  // Historial (solo se ve si la persona lo pide)
  renderizarHistorial(visibles);
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
    llenarSelectoresBanco();
    renderizar();
    renderizarBancos();
    renderizarCategorias();
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
  if (!selectBanco.value) {
    if (bancos.length === 0) abrirPanelBancos();
    return mostrarError(bancos.length ? "Elige el banco del gasto." : "Primero crea un banco en «Mis bancos».");
  }
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
        banco_id: Number(selectBanco.value),
        descripcion: selectCategoria.value === CATEGORIA_RETIROS ? inputDescripcion.value.trim() : "",
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo guardar el gasto.");

    inputConcepto.value = "";
    inputMonto.value = "";
    inputDescripcion.value = "";
    inputConcepto.focus();
    ampliarRango(inputFecha.value); // si cae fuera del rango, se amplía para que se vea
    asegurarBancoVisible(selectBanco.value);
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
const bancoImportar = document.getElementById("banco-importar");
const btnCrearBancoImportar = document.getElementById("btn-crear-banco-importar");

let datosCSV = null;       // { encabezados, filas } del archivo cargado
let filasImportar = [];    // movimientos propuestos para importar
let omitidasImportar = 0;  // ingresos o filas no válidas

const REGLAS_CATEGORIA = [
  ["Retiros y avances", ["retiro", "retiros", "avance", "avances", "cajero"]],
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
  const sugerida = regla ? regla[0] : "Otros";
  // Si esa categoría ya no existe (la quitaste), se usa "Otros"
  return categorias.some((c) => c.nombre === sugerida) ? sugerida : "Otros";
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

  // Si ya se está viendo un banco concreto, el extracto se asigna a ese banco por defecto
  // Se pide elegir el banco en cada extracto (así no se asigna al banco equivocado por costumbre)
  const f = filtroBanco.value;
  if (f !== "todos" && f !== "ninguno") bancoImportar.value = f;
  else bancoImportar.value = bancos.length === 1 ? String(bancos[0].id) : "";

  construirFilasImportar();
}

/* ---- Vista previa ---- */
function claveGasto(fecha, concepto, monto, bancoId) {
  return `${fecha}|${String(concepto).trim().toLowerCase()}|${Number(monto).toFixed(2)}|${bancoId ?? ""}`;
}

function construirFilasImportar() {
  if (!datosCSV) return;
  const iF = +colFecha.value;
  const iC = +colConcepto.value;
  const iM = +colMonto.value;
  const bancoSel = bancoImportar.value ? Number(bancoImportar.value) : null;

  // Gastos ya registrados (se cuentan para no marcar de más compras idénticas)
  const registrados = new Map();
  gastos.forEach((g) => {
    const k = claveGasto(g.fecha, g.concepto, g.monto, g.banco_id);
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
    const clave = claveGasto(fecha, concepto, monto, bancoSel);
    const duplicado = (registrados.get(clave) || 0) > 0;
    if (duplicado) registrados.set(clave, registrados.get(clave) - 1);
    filasImportar.push({
      incluir: !duplicado, fecha, concepto, monto, duplicado, descripcion: "",
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
  const desc = document.createElement("input");
  desc.type = "text";
  desc.maxLength = 200;
  desc.className = "desc-importar";
  desc.placeholder = "Descripción del retiro o avance (opcional)";
  desc.setAttribute("aria-label", `Descripción de: ${fila.concepto}`);
  desc.value = fila.descripcion;
  desc.hidden = fila.categoria !== CATEGORIA_RETIROS;
  desc.addEventListener("input", () => { fila.descripcion = desc.value; });
  categoria.addEventListener("change", () => {
    fila.categoria = categoria.value;
    desc.hidden = fila.categoria !== CATEGORIA_RETIROS;
  });

  li.append(check, info, monto, categoria, desc);
  return li;
}

function actualizarResumenImportar() {
  const elegidas = filasImportar.filter((f) => f.incluir);
  const total = elegidas.reduce((s, f) => s + f.monto, 0);
  const ya = filasImportar.filter((f) => f.duplicado).length;
  const partes = [`Se importarán ${elegidas.length} ${elegidas.length === 1 ? "gasto" : "gastos"} por ${formatoMoneda.format(total)}.`];
  if (ya) partes.push(`Ya registrados: ${ya}.`);
  if (omitidasImportar) partes.push(`Omitidas (ingresos o filas no válidas): ${omitidasImportar}.`);
  if (!bancoImportar.value) {
    partes.push(bancos.length ? "Elige el banco del extracto para poder importar." : "Crea un banco para poder importar.");
  }
  resumenImportar.textContent = partes.join(" ");
  btnConfirmarImportar.disabled = elegidas.length === 0 || !bancoImportar.value;
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
  if (elegidas.length === 0 || !bancoImportar.value) return;
  btnConfirmarImportar.disabled = true;
  try {
    const respuesta = await fetch(`${API_URL}/importar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        banco_id: bancoImportar.value ? Number(bancoImportar.value) : null,
        gastos: elegidas.map(({ fecha, concepto, monto, categoria, descripcion }) => ({
          fecha, concepto, monto, categoria,
          descripcion: categoria === CATEGORIA_RETIROS ? descripcion.trim() : "",
        })),
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo importar el archivo.");

    elegidas.forEach((f) => ampliarRango(f.fecha));
    asegurarBancoVisible(bancoImportar.value);
    const banco = bancos.find((x) => String(x.id) === bancoImportar.value);
    cerrarImportacion();
    await cargarGastos();
    let texto = `Se importaron ${datos.importados} ${datos.importados === 1 ? "gasto" : "gastos"}${banco ? ` en ${banco.nombre}` : ""}.`;
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
[colFecha, colConcepto, colMonto, formatoFechaCSV, modoMonto, bancoImportar].forEach((el) =>
  el.addEventListener("change", construirFilasImportar)
);
btnConfirmarImportar.addEventListener("click", confirmarImportacion);
btnCancelarImportar.addEventListener("click", () => { cerrarImportacion(); mostrarMensajeImportar("", false); });

/* ============================ Bancos ============================ */
function llenarSelectoresBanco() {
  const hayPendientes = gastos.some((g) => g.banco_id == null);
  const f = filtroBanco.value;
  const preferido = f !== "todos" && f !== "ninguno" ? f : "";
  const existe = (v) => v !== "" && bancos.some((b) => String(b.id) === v);

  // Selectores donde elegir un banco es obligatorio
  [selectBanco, bancoImportar].forEach((sel) => {
    const actual = sel.value;
    const marcador = new Option(bancos.length ? "Elige un banco" : "Primero crea un banco", "");
    marcador.disabled = true;
    sel.replaceChildren(marcador, ...bancos.map((b) => new Option(b.nombre, String(b.id))));
    if (existe(actual)) sel.value = actual;
    else if (bancos.length === 1) sel.value = String(bancos[0].id);
    else if (existe(preferido)) sel.value = preferido;
    else sel.value = "";
  });

  // Filtro: "Sin banco asignado" solo aparece mientras queden gastos antiguos sin banco
  const iniciales = [new Option("Todos los bancos", "todos")];
  if (hayPendientes) iniciales.push(new Option("Sin banco asignado", "ninguno"));
  filtroBanco.replaceChildren(...iniciales, ...bancos.map((b) => new Option(b.nombre, String(b.id))));
  if (Array.from(filtroBanco.options).some((o) => o.value === f)) filtroBanco.value = f;
}

// Si se está filtrando por otro banco, cambia el filtro para que se vea lo que se acaba de guardar
function asegurarBancoVisible(bancoId) {
  if (filtroBanco.value === "todos" || !bancoId) return;
  if (filtroBanco.value !== String(bancoId)) filtroBanco.value = String(bancoId);
}

function renderizarPendientes() {
  const n = gastos.filter((g) => g.banco_id == null).length;
  avisoPendientes.hidden = n === 0;
  if (n === 0) return;
  textoPendientes.textContent = `Tienes ${n} ${n === 1 ? "gasto" : "gastos"} sin banco. Todos los gastos deben tener uno.`;
  const actual = asignarBanco.value;
  const marcador = new Option(bancos.length ? "Elige un banco" : "Primero crea un banco", "");
  marcador.disabled = true;
  asignarBanco.replaceChildren(marcador, ...bancos.map((b) => new Option(b.nombre, String(b.id))));
  const valido = bancos.some((b) => String(b.id) === actual);
  asignarBanco.value = valido ? actual : bancos.length === 1 ? String(bancos[0].id) : "";
}

async function asignarPendientes() {
  if (!asignarBanco.value) {
    if (bancos.length === 0) abrirPanelBancos();
    return mostrarError(bancos.length ? "Elige un banco para asignar." : "Primero crea un banco en «Mis bancos».");
  }
  mostrarError("");
  try {
    const respuesta = await fetch(`${API_URL}/asignar-banco`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banco_id: Number(asignarBanco.value) }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || "No se pudieron asignar los gastos.");
    await cargarGastos();
  } catch (error) {
    mostrarError(error.message);
  }
}

function abrirPanelBancos() {
  panelBancos.open = true;
  panelBancos.scrollIntoView({ behavior: "smooth", block: "center" });
  inputNuevoBanco.focus();
}

function mostrarMensajeBanco(texto, esError) {
  msgBanco.textContent = texto;
  msgBanco.hidden = !texto;
  msgBanco.classList.toggle("mensaje-ok", !esError);
}

function renderizarBancos() {
  const conteo = new Map();
  gastos.forEach((g) => conteo.set(g.banco_id ?? null, (conteo.get(g.banco_id ?? null) || 0) + 1));
  const fila = (nombre, n) => {
    const li = document.createElement("li");
    li.className = "banco";
    const a = document.createElement("span");
    a.textContent = nombre;
    const b = document.createElement("span");
    b.className = "banco-detalle";
    b.textContent = `${n} ${n === 1 ? "gasto" : "gastos"}`;
    li.append(a, b);
    return li;
  };
  const items = bancos.map((b) => fila(b.nombre, conteo.get(b.id) || 0));
  if (conteo.get(null)) items.push(fila("Sin banco asignado", conteo.get(null)));
  listaBancos.replaceChildren(...items);
  vacioBancos.hidden = bancos.length > 0;
  renderizarPendientes();
}

async function cargarBancos() {
  try {
    const respuesta = await fetch(BANCOS_URL);
    if (!respuesta.ok) throw new Error();
    bancos = await respuesta.json();
    llenarSelectoresBanco();
    renderizarBancos();
  } catch {
    mostrarError("No se pudieron cargar los bancos. Reinicia el servidor con el app.py más reciente.");
  }
}

async function crearBanco(evento) {
  evento.preventDefault();
  const nombre = inputNuevoBanco.value.trim();
  if (!nombre) return mostrarMensajeBanco("Escribe el nombre del banco.", true);
  try {
    const respuesta = await fetch(BANCOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudo crear el banco. Reinicia el servidor con el app.py más reciente.");
    }
    bancos.push(datos);
    bancos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    llenarSelectoresBanco();
    renderizarBancos();
    inputNuevoBanco.value = "";
    mostrarMensajeBanco(`Banco «${datos.nombre}» creado.`, false);
    if (!detalleImportar.hidden) { // si se está importando, se usa de una vez
      bancoImportar.value = String(datos.id);
      construirFilasImportar();
    }
  } catch (error) {
    mostrarMensajeBanco(error.message, true);
  }
}

formBanco.addEventListener("submit", crearBanco);
btnCrearBancoImportar.addEventListener("click", abrirPanelBancos);
btnAsignarBanco.addEventListener("click", asignarPendientes);
selectCategoria.addEventListener("change", () => {
  campoDescripcion.hidden = selectCategoria.value !== CATEGORIA_RETIROS;
});
btnVistaGeneral.addEventListener("click", () => { vistaHistorial = "general"; renderizar(); });
btnVistaBanco.addEventListener("click", () => { vistaHistorial = "banco"; renderizar(); });
btnAnio.addEventListener("click", () => {
  ponerRangoDelAnio();
  renderizar();
});
filtroBanco.addEventListener("change", renderizar);

/* =========================== Categorías =========================== */
function mostrarMensajeCategoria(texto, esError) {
  msgCategoria.textContent = texto;
  msgCategoria.hidden = !texto;
  msgCategoria.classList.toggle("mensaje-ok", !esError);
}

function llenarSelectorCategoria() {
  const actual = selectCategoria.value;
  selectCategoria.replaceChildren(...categorias.map((c) => new Option(c.nombre, c.nombre)));
  selectCategoria.value = categorias.some((c) => c.nombre === actual) ? actual : (categorias[0]?.nombre ?? "");
  campoDescripcion.hidden = selectCategoria.value !== CATEGORIA_RETIROS;
}

function crearFilaCategoria(c, n) {
  const li = document.createElement("li");
  li.className = "banco";
  const nombre = document.createElement("span");
  nombre.textContent = c.nombre;
  const detalle = document.createElement("span");
  detalle.className = "banco-detalle";
  detalle.textContent = `${n} ${n === 1 ? "gasto" : "gastos"}`;
  const acciones = document.createElement("div");
  acciones.className = "banco-acciones";
  acciones.append(detalle);
  li.append(nombre, acciones);

  if (c.protegida) {
    const fija = document.createElement("span");
    fija.className = "banco-detalle";
    fija.textContent = "Fija";
    fija.title = "Esta categoría no se puede quitar";
    acciones.append(fija);
    return li;
  }

  const quitar = document.createElement("button");
  quitar.type = "button";
  quitar.className = "btn-eliminar";
  quitar.textContent = "Quitar";
  quitar.setAttribute("aria-label", `Quitar la categoría ${c.nombre}`);
  acciones.append(quitar);

  if (n === 0) { // sin gastos: se quita de una vez
    quitar.addEventListener("click", () => quitarCategoria(c, null));
    return li;
  }

  // Con gastos: primero se elige a qué categoría moverlos
  const form = document.createElement("form");
  form.className = "editor-descripcion";
  form.hidden = true;
  const etiqueta = document.createElement("span");
  etiqueta.textContent = `Mover sus ${n} ${n === 1 ? "gasto" : "gastos"} a:`;
  const destino = document.createElement("select");
  destino.setAttribute("aria-label", `Categoría de destino para los gastos de ${c.nombre}`);
  const otras = categorias.filter((x) => x.id !== c.id);
  destino.replaceChildren(...otras.map((x) => new Option(x.nombre, String(x.id))));
  const respaldo = otras.find((x) => x.nombre === "Otros");
  if (respaldo) destino.value = String(respaldo.id);
  const confirmar = document.createElement("button");
  confirmar.type = "submit";
  confirmar.className = "btn-secundario";
  confirmar.textContent = "Quitar y mover";
  const cancelar = document.createElement("button");
  cancelar.type = "button";
  cancelar.className = "enlace";
  cancelar.textContent = "Cancelar";
  quitar.addEventListener("click", () => { form.hidden = !form.hidden; });
  cancelar.addEventListener("click", () => { form.hidden = true; });
  form.addEventListener("submit", (e) => { e.preventDefault(); quitarCategoria(c, Number(destino.value)); });
  form.append(etiqueta, destino, confirmar, cancelar);
  li.append(form);
  return li;
}

function renderizarCategorias() {
  const conteo = new Map();
  gastos.forEach((g) => {
    const k = String(g.categoria).toLowerCase();
    conteo.set(k, (conteo.get(k) || 0) + 1);
  });
  listaCategorias.replaceChildren(
    ...categorias.map((c) => crearFilaCategoria(c, conteo.get(c.nombre.toLowerCase()) || 0))
  );
}

async function cargarCategorias() {
  try {
    const respuesta = await fetch(CATEGORIAS_URL);
    if (!respuesta.ok) throw new Error();
    categorias = await respuesta.json();
    llenarSelectorCategoria();
    renderizarCategorias();
  } catch {
    mostrarError("No se pudieron cargar las categorías. Reinicia el servidor con el app.py más reciente.");
  }
}

async function crearCategoria(evento) {
  evento.preventDefault();
  const nombre = inputNuevaCategoria.value.trim();
  if (!nombre) return mostrarMensajeCategoria("Escribe el nombre de la categoría.", true);
  try {
    const respuesta = await fetch(CATEGORIAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudo crear la categoría. Reinicia el servidor con el app.py más reciente.");
    }
    await cargarCategorias();
    inputNuevaCategoria.value = "";
    mostrarMensajeCategoria(`Categoría «${datos.nombre}» creada.`, false);
  } catch (error) {
    mostrarMensajeCategoria(error.message, true);
  }
}

async function quitarCategoria(categoria, destinoId) {
  mostrarMensajeCategoria("", false);
  try {
    const url = destinoId ? `${CATEGORIAS_URL}/${categoria.id}?reasignar=${destinoId}` : `${CATEGORIAS_URL}/${categoria.id}`;
    const respuesta = await fetch(url, { method: "DELETE" });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudo quitar la categoría. Reinicia el servidor con el app.py más reciente.");
    }
    await cargarCategorias();
    await cargarGastos();
    const movidos = datos.movidos ? ` Se movieron ${datos.movidos} ${datos.movidos === 1 ? "gasto" : "gastos"}.` : "";
    mostrarMensajeCategoria(`Categoría «${categoria.nombre}» quitada.${movidos}`, false);
  } catch (error) {
    mostrarMensajeCategoria(error.message, true);
  }
}

formCategoria.addEventListener("submit", crearCategoria);

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
Promise.all([cargarBancos(), cargarCategorias()]).then(cargarGastos);