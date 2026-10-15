"""Servidor Flask y API REST del seguimiento de gastos."""
import math
import os
from collections import Counter
from io import BytesIO
from contextlib import closing
from datetime import date, datetime

from flask import Flask, jsonify, request, send_from_directory

from database import get_connection, init_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Los archivos de la carpeta 'static' se sirven en /static/...
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # archivos de hasta 10 MB

MAX_IMPORTAR = 5000
MAX_FILAS_EXCEL = 20000

init_db()


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


def fila_a_dict(fila):
    return {k: fila[k] for k in fila.keys()}


def validar_gasto(datos):
    """Devuelve (gasto_limpio, error). Si hay error, gasto_limpio es None."""
    if not isinstance(datos, dict):
        return None, "El cuerpo debe ser un objeto JSON."

    fecha = str(datos.get("fecha", "")).strip()
    concepto = str(datos.get("concepto", "")).strip()
    categoria = str(datos.get("categoria", "")).strip()

    try:
        datetime.strptime(fecha, "%Y-%m-%d")
    except ValueError:
        return None, "La fecha debe tener el formato AAAA-MM-DD."

    if not concepto:
        return None, "El concepto es obligatorio."
    if not categoria:
        return None, "La categoría es obligatoria."

    try:
        monto = float(datos.get("monto"))
    except (TypeError, ValueError):
        return None, "El monto debe ser un número."
    if not math.isfinite(monto) or monto <= 0:
        return None, "El monto debe ser mayor que cero."

    return {
        "fecha": fecha,
        "concepto": concepto,
        "monto": monto,
        "categoria": categoria,
    }, None


@app.route("/api/gastos", methods=["GET"])
def listar_gastos():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT id, fecha, concepto, monto, categoria "
            "FROM gastos ORDER BY fecha DESC, id DESC"
        ).fetchall()
    return jsonify([fila_a_dict(f) for f in filas])


@app.route("/api/gastos", methods=["POST"])
def crear_gasto():
    gasto, error = validar_gasto(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400

    with closing(get_connection()) as conn:
        with conn:
            # Consulta parametrizada: evita inyección SQL
            cursor = conn.execute(
                "INSERT INTO gastos (fecha, concepto, monto, categoria) "
                "VALUES (?, ?, ?, ?)",
                (gasto["fecha"], gasto["concepto"], gasto["monto"], gasto["categoria"]),
            )
            nuevo_id = cursor.lastrowid

    return jsonify({"id": nuevo_id, **gasto}), 201


def clave_gasto(fecha, concepto, monto):
    return (fecha, str(concepto).strip().lower(), round(float(monto), 2))


@app.route("/api/gastos/importar", methods=["POST"])
def importar_gastos():
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict) or not isinstance(datos.get("gastos"), list):
        return jsonify({"error": "Se esperaba un JSON con la lista 'gastos'."}), 400
    if len(datos["gastos"]) > MAX_IMPORTAR:
        return jsonify({"error": f"Máximo {MAX_IMPORTAR} movimientos por importación."}), 400

    validos, invalidos = [], 0
    for item in datos["gastos"]:
        gasto, error = validar_gasto(item)
        if error:
            invalidos += 1
        else:
            validos.append(gasto)

    importados = duplicados = 0
    with closing(get_connection()) as conn:
        with conn:
            # Se cuentan los gastos ya guardados: así dos compras idénticas del mismo
            # día en el archivo se importan ambas, pero reimportar el archivo no duplica.
            existentes = Counter(
                clave_gasto(f["fecha"], f["concepto"], f["monto"])
                for f in conn.execute("SELECT fecha, concepto, monto FROM gastos")
            )
            for g in validos:
                clave = clave_gasto(g["fecha"], g["concepto"], g["monto"])
                if existentes[clave] > 0:
                    existentes[clave] -= 1
                    duplicados += 1
                    continue
                conn.execute(
                    "INSERT INTO gastos (fecha, concepto, monto, categoria) VALUES (?, ?, ?, ?)",
                    (g["fecha"], g["concepto"], g["monto"], g["categoria"]),
                )
                importados += 1

    return jsonify({"importados": importados, "duplicados": duplicados, "invalidos": invalidos})


def celda_excel(valor):
    """Normaliza una celda: fechas a AAAA-MM-DD, números como número, el resto como texto."""
    if valor is None:
        return ""
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, bool):
        return str(valor)
    if isinstance(valor, float):
        if not math.isfinite(valor):
            return ""
        return int(valor) if valor.is_integer() else valor
    if isinstance(valor, int):
        return valor
    return str(valor).strip()


def filas_xlsx(contenido):
    from openpyxl import load_workbook

    libro = load_workbook(BytesIO(contenido), read_only=True, data_only=True)
    try:
        hojas = []
        for hoja in libro.worksheets:
            filas = []
            for fila in hoja.iter_rows(values_only=True):
                celdas = [celda_excel(v) for v in fila]
                if any(c != "" for c in celdas):
                    filas.append(celdas)
                if len(filas) > MAX_FILAS_EXCEL:
                    raise ValueError("Demasiadas filas")
            hojas.append(filas)
    finally:
        libro.close()
    return max(hojas, key=len) if hojas else []  # la hoja con más datos


def filas_xls(contenido):
    import xlrd

    libro = xlrd.open_workbook(file_contents=contenido)
    hojas = []
    for hoja in libro.sheets():
        filas = []
        for r in range(min(hoja.nrows, MAX_FILAS_EXCEL)):
            celdas = []
            for c in hoja.row(r):
                if c.ctype == xlrd.XL_CELL_DATE:
                    try:
                        celdas.append(xlrd.xldate_as_datetime(c.value, libro.datemode).date().isoformat())
                    except ValueError:
                        celdas.append("")
                elif c.ctype == xlrd.XL_CELL_NUMBER:
                    celdas.append(celda_excel(c.value))
                elif c.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR):
                    celdas.append("")
                else:
                    celdas.append(str(c.value).strip())
            if any(x != "" for x in celdas):
                filas.append(celdas)
        hojas.append(filas)
    return max(hojas, key=len) if hojas else []


@app.route("/api/gastos/importar/excel", methods=["POST"])
def leer_excel():
    """Lee un .xlsx/.xls y devuelve sus filas; la vista previa se arma en el navegador."""
    archivo = request.files.get("archivo")
    if archivo is None or not archivo.filename:
        return jsonify({"error": "No se recibió ningún archivo."}), 400
    nombre = archivo.filename.lower()
    contenido = archivo.read()
    try:
        if nombre.endswith((".xlsx", ".xlsm")):
            filas = filas_xlsx(contenido)
        elif nombre.endswith(".xls"):
            filas = filas_xls(contenido)
        else:
            return jsonify({"error": "Formato no compatible. Usa .xlsx, .xls o .csv."}), 400
    except ImportError:
        return jsonify({"error": "Falta instalar las librerías de Excel. Ejecuta: pip install -r requirements.txt"}), 500
    except Exception:
        return jsonify({"error": "No se pudo leer el Excel. Verifica que no esté dañado ni protegido con contraseña."}), 400
    if not filas:
        return jsonify({"error": "El archivo no tiene datos."}), 400
    return jsonify({"filas": filas})


@app.route("/api/gastos/<int:gasto_id>", methods=["DELETE"])
def eliminar_gasto(gasto_id):
    with closing(get_connection()) as conn:
        with conn:
            cursor = conn.execute("DELETE FROM gastos WHERE id = ?", (gasto_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "Gasto no encontrado."}), 404
    return jsonify({"mensaje": "Gasto eliminado.", "id": gasto_id})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)