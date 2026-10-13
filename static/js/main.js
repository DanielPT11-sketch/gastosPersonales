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
    // Si el gasto cae fuera del rango, se amplía el rango para que se vea el cambio
    if (inputDesde.value && inputFecha.value < inputDesde.value) inputDesde.value = inputFecha.value;
    if (inputHasta.value && inputFecha.value > inputHasta.value) inputHasta.value = inputFecha.value;
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