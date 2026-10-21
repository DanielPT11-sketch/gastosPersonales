"""Servidor Flask y API REST del seguimiento de gastos."""
import math
import os
import sqlite3
from collections import Counter
from io import BytesIO
from contextlib import closing
from datetime import date, datetime

from flask import Flask, jsonify, request, send_from_directory

from database import CATEGORIAS_FIJAS, get_connection, init_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Los archivos de la carpeta 'static' se sirven en /static/...
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # archivos de hasta 10 MB

MAX_IMPORTAR = 5000
MAX_FILAS_EXCEL = 20000
MAX_DESCRIPCION = 200

init_db()


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/angular/")
def prototipo_angular():
    """Prototipo en Angular (compilado en static/angular); usa la misma API."""
    return send_from_directory(os.path.join(STATIC_DIR, "angular"), "index.html")


def fila_a_dict(fila):
    return {k: fila[k] for k in fila.keys()}


def validar_banco_id(valor, ids_bancos):
    """Devuelve (banco_id, error). None = sin banco."""
    if valor is None or valor == "":
        return None, None
    if isinstance(valor, bool):
        return None, "El banco no es válido."
    try:
        banco_id = int(valor)
    except (TypeError, ValueError):
        return None, "El banco no es válido."
    if ids_bancos is not None and banco_id not in ids_bancos:
        return None, "El banco indicado no existe."
    return banco_id, None


def validar_gasto(datos, ids_bancos=None, categorias=None):
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
    if categorias is not None:  # debe ser una categoría existente (se usa su escritura oficial)
        categoria = categorias.get(categoria.lower())
        if categoria is None:
            return None, "La categoría no existe."

    try:
        monto = float(datos.get("monto"))
    except (TypeError, ValueError):
        return None, "El monto debe ser un número."
    if not math.isfinite(monto) or monto <= 0:
        return None, "El monto debe ser mayor que cero."

    banco_id, error_banco = validar_banco_id(datos.get("banco_id"), ids_bancos)
    if error_banco:
        return None, error_banco
    if banco_id is None:
        return None, "Elige el banco del gasto."

    descripcion = " ".join(str(datos.get("descripcion") or "").split())
    if len(descripcion) > MAX_DESCRIPCION:
        return None, f"La descripción es demasiado larga (máximo {MAX_DESCRIPCION} caracteres)."

    return {
        "fecha": fecha,
        "concepto": concepto,
        "monto": monto,
        "categoria": categoria,
        "banco_id": banco_id,
        "descripcion": descripcion or None,
    }, None


@app.route("/api/gastos", methods=["GET"])
def listar_gastos():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT g.id, g.fecha, g.concepto, g.monto, g.categoria, g.descripcion, g.banco_id, b.nombre AS banco "
            "FROM gastos g LEFT JOIN bancos b ON b.id = g.banco_id "
            "ORDER BY g.fecha DESC, g.id DESC"
        ).fetchall()
    return jsonify([fila_a_dict(f) for f in filas])


def ids_bancos(conn):
    return {f["id"] for f in conn.execute("SELECT id FROM bancos")}


def nombres_categoria(conn):
    """{'alimentación': 'Alimentación', ...} para validar sin importar mayúsculas."""
    return {f["nombre"].lower(): f["nombre"] for f in conn.execute("SELECT nombre FROM categorias")}


FIJAS_MIN = {n.lower() for n in CATEGORIAS_FIJAS}


@app.route("/api/categorias", methods=["GET"])
def listar_categorias():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT id, nombre FROM categorias "
            "ORDER BY (nombre = 'Otros' COLLATE NOCASE), nombre COLLATE NOCASE"
        ).fetchall()
    return jsonify([
        {"id": f["id"], "nombre": f["nombre"], "protegida": f["nombre"].lower() in FIJAS_MIN}
        for f in filas
    ])


@app.route("/api/categorias", methods=["POST"])
def crear_categoria():
    datos = request.get_json(silent=True)
    nombre = " ".join(str(datos.get("nombre", "")).split()) if isinstance(datos, dict) else ""
    if not nombre:
        return jsonify({"error": "El nombre de la categoría es obligatorio."}), 400
    if len(nombre) > 40:
        return jsonify({"error": "El nombre es demasiado largo (máximo 40 caracteres)."}), 400
    try:
        with closing(get_connection()) as conn:
            if nombre.lower() in nombres_categoria(conn):
                return jsonify({"error": "Ya existe una categoría con ese nombre."}), 409
            with conn:
                cursor = conn.execute("INSERT INTO categorias (nombre) VALUES (?)", (nombre,))
                nuevo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ya existe una categoría con ese nombre."}), 409
    return jsonify({"id": nuevo_id, "nombre": nombre, "protegida": False}), 201


@app.route("/api/categorias/<int:categoria_id>", methods=["DELETE"])
def eliminar_categoria(categoria_id):
    """Quita una categoría. Si tiene gastos, hay que indicar a cuál moverlos (?reasignar=id)."""
    destino_id = request.args.get("reasignar", type=int)
    with closing(get_connection()) as conn:
        fila = conn.execute("SELECT id, nombre FROM categorias WHERE id = ?", (categoria_id,)).fetchone()
        if fila is None:
            return jsonify({"error": "Categoría no encontrada."}), 404
        if fila["nombre"].lower() in FIJAS_MIN:
            return jsonify({"error": "Esta categoría no se puede quitar."}), 400
        usados = conn.execute(
            "SELECT COUNT(*) FROM gastos WHERE categoria = ? COLLATE NOCASE", (fila["nombre"],)
        ).fetchone()[0]
        destino = None
        if usados:
            if destino_id is None or destino_id == categoria_id:
                return jsonify({
                    "error": f"Hay {usados} {'gasto' if usados == 1 else 'gastos'} en esta categoría. Elige a cuál categoría moverlos.",
                    "gastos": usados,
                }), 409
            destino = conn.execute("SELECT nombre FROM categorias WHERE id = ?", (destino_id,)).fetchone()
            if destino is None:
                return jsonify({"error": "La categoría de destino no existe."}), 400
        with conn:
            if usados:
                conn.execute(
                    "UPDATE gastos SET categoria = ? WHERE categoria = ? COLLATE NOCASE",
                    (destino["nombre"], fila["nombre"]),
                )
            conn.execute("DELETE FROM categorias WHERE id = ?", (categoria_id,))
    return jsonify({"id": categoria_id, "movidos": usados})


@app.route("/api/bancos", methods=["GET"])
def listar_bancos():
    with closing(get_connection()) as conn:
        filas = conn.execute("SELECT id, nombre FROM bancos ORDER BY nombre COLLATE NOCASE").fetchall()
    return jsonify([fila_a_dict(f) for f in filas])


@app.route("/api/bancos", methods=["POST"])
def crear_banco():
    datos = request.get_json(silent=True)
    nombre = " ".join(str(datos.get("nombre", "")).split()) if isinstance(datos, dict) else ""
    if not nombre:
        return jsonify({"error": "El nombre del banco es obligatorio."}), 400
    if len(nombre) > 60:
        return jsonify({"error": "El nombre es demasiado largo (máximo 60 caracteres)."}), 400
    try:
        with closing(get_connection()) as conn:
            with conn:
                cursor = conn.execute("INSERT INTO bancos (nombre) VALUES (?)", (nombre,))
                nuevo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ya existe un banco con ese nombre."}), 409
    return jsonify({"id": nuevo_id, "nombre": nombre}), 201


@app.route("/api/gastos", methods=["POST"])
def crear_gasto():
    with closing(get_connection()) as conn:
        gasto, error = validar_gasto(request.get_json(silent=True), ids_bancos(conn), nombres_categoria(conn))
        if error:
            return jsonify({"error": error}), 400
        with conn:
            # Consulta parametrizada: evita inyección SQL
            cursor = conn.execute(
                "INSERT INTO gastos (fecha, concepto, monto, categoria, banco_id, descripcion) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (gasto["fecha"], gasto["concepto"], gasto["monto"], gasto["categoria"],
                 gasto["banco_id"], gasto["descripcion"]),
            )
            nuevo_id = cursor.lastrowid
    return jsonify({"id": nuevo_id, **gasto}), 201


def clave_gasto(fecha, concepto, monto, banco_id):
    return (fecha, str(concepto).strip().lower(), round(float(monto), 2), banco_id)


@app.route("/api/gastos/importar", methods=["POST"])
def importar_gastos():
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict) or not isinstance(datos.get("gastos"), list):
        return jsonify({"error": "Se esperaba un JSON con la lista 'gastos'."}), 400
    if len(datos["gastos"]) > MAX_IMPORTAR:
        return jsonify({"error": f"Máximo {MAX_IMPORTAR} movimientos por importación."}), 400

    importados = duplicados = invalidos = 0
    with closing(get_connection()) as conn:
        # Todos los movimientos del archivo van al mismo banco (o a ninguno)
        banco_id, error = validar_banco_id(datos.get("banco_id"), ids_bancos(conn))
        if error:
            return jsonify({"error": error}), 400
        if banco_id is None:
            return jsonify({"error": "Elige el banco del extracto."}), 400

        categorias = nombres_categoria(conn)
        validos = []
        for item in datos["gastos"]:
            gasto, error = validar_gasto(
                {**item, "banco_id": banco_id} if isinstance(item, dict) else item, categorias=categorias
            )
            if error:
                invalidos += 1
            else:
                validos.append(gasto)

        with conn:
            # Se cuentan los gastos ya guardados (del mismo banco): dos compras idénticas
            # del mismo día en el archivo se importan ambas, pero reimportar no duplica.
            existentes = Counter(
                clave_gasto(f["fecha"], f["concepto"], f["monto"], f["banco_id"])
                for f in conn.execute("SELECT fecha, concepto, monto, banco_id FROM gastos")
            )
            for g in validos:
                clave = clave_gasto(g["fecha"], g["concepto"], g["monto"], g["banco_id"])
                if existentes[clave] > 0:
                    existentes[clave] -= 1
                    duplicados += 1
                    continue
                conn.execute(
                    "INSERT INTO gastos (fecha, concepto, monto, categoria, banco_id, descripcion) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (g["fecha"], g["concepto"], g["monto"], g["categoria"], g["banco_id"], g["descripcion"]),
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


@app.route("/api/gastos/<int:gasto_id>", methods=["PATCH"])
def actualizar_gasto(gasto_id):
    """Edita la categoría y/o la descripción de un gasto."""
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict) or not ({"categoria", "descripcion"} & datos.keys()):
        return jsonify({"error": "Solo se puede actualizar la categoría o la descripción."}), 400
    campos, valores = [], []
    with closing(get_connection()) as conn:
        if "categoria" in datos:
            categoria = nombres_categoria(conn).get(str(datos.get("categoria") or "").strip().lower())
            if categoria is None:
                return jsonify({"error": "La categoría no existe."}), 400
            campos.append("categoria = ?")
            valores.append(categoria)
        if "descripcion" in datos:
            descripcion = " ".join(str(datos.get("descripcion") or "").split())
            if len(descripcion) > MAX_DESCRIPCION:
                return jsonify({"error": f"La descripción es demasiado larga (máximo {MAX_DESCRIPCION} caracteres)."}), 400
            campos.append("descripcion = ?")
            valores.append(descripcion or None)
        with conn:
            cursor = conn.execute(f"UPDATE gastos SET {', '.join(campos)} WHERE id = ?", (*valores, gasto_id))
        if cursor.rowcount == 0:
            return jsonify({"error": "Gasto no encontrado."}), 404
        fila = conn.execute("SELECT id, categoria, descripcion FROM gastos WHERE id = ?", (gasto_id,)).fetchone()
    return jsonify(fila_a_dict(fila))


@app.route("/api/gastos/asignar-banco", methods=["POST"])
def asignar_banco():
    """Asigna un banco a todos los gastos antiguos que quedaron sin banco."""
    datos = request.get_json(silent=True)
    with closing(get_connection()) as conn:
        banco_id, error = validar_banco_id(
            datos.get("banco_id") if isinstance(datos, dict) else None, ids_bancos(conn)
        )
        if error or banco_id is None:
            return jsonify({"error": error or "Elige un banco."}), 400
        with conn:
            cursor = conn.execute("UPDATE gastos SET banco_id = ? WHERE banco_id IS NULL", (banco_id,))
    return jsonify({"asignados": cursor.rowcount})


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