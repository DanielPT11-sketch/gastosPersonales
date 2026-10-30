"""Servidor Flask: sirve la aplicación Angular compilada (carpeta static/) y la API REST.

Todo corre en un solo servidor: http://127.0.0.1:5000
Cada persona tiene su propia cuenta y solo ve sus propios datos.
"""
import math
import os
import re
import secrets
import sqlite3
import time
from collections import Counter
from contextlib import closing
from datetime import date, datetime, timedelta
from functools import wraps
from io import BytesIO

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

from database import CATEGORIAS_FIJAS, crear_usuario, get_connection, init_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


def cargar_clave_secreta():
    """Clave que firma las sesiones. Se guarda en un archivo (.secret_key) para que las
    sesiones sigan abiertas al reiniciar el servidor. También puede venir de GASTOS_SECRET_KEY."""
    clave = os.environ.get("GASTOS_SECRET_KEY")
    if clave:
        return clave
    ruta = os.path.join(BASE_DIR, ".secret_key")
    if not os.path.exists(ruta):
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(secrets.token_hex(32))
        try:
            os.chmod(ruta, 0o600)
        except OSError:
            pass
    with open(ruta, encoding="utf-8") as f:
        return f.read().strip()


# La carpeta 'static' contiene la aplicación Angular compilada (index.html, main-*.js,
# chunk-*.js, styles-*.css...). Sus archivos se sirven en /static/... (el index.html
# compilado usa <base href="/static/">).
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
app.config.update(
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,  # archivos de hasta 10 MB
    SECRET_KEY=cargar_clave_secreta(),
    SESSION_COOKIE_HTTPONLY=True,  # el JavaScript de la página no puede leer la cookie
    SESSION_COOKIE_SAMESITE="Lax",  # otras páginas no pueden enviar acciones con tu sesión
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

MAX_IMPORTAR = 5000
MAX_FILAS_EXCEL = 20000
MAX_DESCRIPCION = 200

init_db()

FIJAS_MIN = {n.lower() for n in CATEGORIAS_FIJAS}


# ============================== Pantalla (Angular) ==============================
@app.route("/")
def index():
    """Entrega la aplicación Angular compilada."""
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(STATIC_DIR, "favicon.ico")


@app.route("/<path:ruta>")
def angular_fallback(ruta):
    """Cualquier otra dirección que no sea de la API entrega también la app Angular
    (por ejemplo al recargar la página o abrir un enlace guardado)."""
    if ruta.startswith("api/"):
        return jsonify({"error": "Ruta de la API no encontrada."}), 404
    return send_from_directory(STATIC_DIR, "index.html")


# ============================== Cuentas y sesión ==============================
USUARIO_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 128
MAX_FALLOS = 5
BLOQUEO_SEGUNDOS = 300
intentos = {}  # (ip, usuario) -> (fallos seguidos, bloqueado hasta)
# Se compara contra este hash cuando el usuario no existe, para que tarde lo mismo
HASH_FALSO = generate_password_hash(secrets.token_hex(8))


def segundos_de_bloqueo(clave):
    return max(0, int(intentos.get(clave, (0, 0))[1] - time.time()))


def anotar_fallo(clave):
    fallos, hasta = intentos.get(clave, (0, 0))
    fallos += 1
    intentos[clave] = (0, time.time() + BLOQUEO_SEGUNDOS) if fallos >= MAX_FALLOS else (fallos, hasta)


def login_requerido(funcion):
    """La ruta solo responde si hay una sesión abierta de una cuenta que existe."""
    @wraps(funcion)
    def envoltura(*args, **kwargs):
        uid = session.get("usuario_id")
        if uid is not None:
            with closing(get_connection()) as conn:
                existe = conn.execute("SELECT 1 FROM usuarios WHERE id = ?", (uid,)).fetchone()
            if existe:
                return funcion(*args, **kwargs)
            session.clear()
        return jsonify({"error": "Inicia sesión para continuar."}), 401
    return envoltura


def uid():
    return session["usuario_id"]


def abrir_sesion(usuario_id):
    session.clear()
    session["usuario_id"] = usuario_id
    session.permanent = True


@app.route("/api/auth/estado", methods=["GET"])
def estado_auth():
    """Lo único público: ¿es la primera cuenta? ¿hay datos de antes que se le asignarán?"""
    with closing(get_connection()) as conn:
        hay_usuarios = conn.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is not None
        datos_previos = conn.execute("SELECT 1 FROM gastos WHERE usuario_id IS NULL LIMIT 1").fetchone() is not None
    return jsonify({"hayUsuarios": hay_usuarios, "datosPrevios": datos_previos and not hay_usuarios})


@app.route("/api/auth/yo", methods=["GET"])
@login_requerido
def quien_soy():
    with closing(get_connection()) as conn:
        fila = conn.execute("SELECT id, usuario FROM usuarios WHERE id = ?", (uid(),)).fetchone()
    return jsonify({"id": fila["id"], "usuario": fila["usuario"]})


@app.route("/api/auth/registro", methods=["POST"])
def registro():
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "Datos no válidos."}), 400
    usuario = str(datos.get("usuario", "")).strip()
    password = str(datos.get("password", ""))
    if not USUARIO_RE.match(usuario):
        return jsonify({"error": "El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo."}), 400
    if len(password) < MIN_PASSWORD:
        return jsonify({"error": f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres."}), 400
    if len(password) > MAX_PASSWORD:
        return jsonify({"error": f"La contraseña es demasiado larga (máximo {MAX_PASSWORD} caracteres)."}), 400
    try:
        with closing(get_connection()) as conn:
            with conn:
                nuevo_id = crear_usuario(conn, usuario, generate_password_hash(password))
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ese usuario ya existe. Elige otro."}), 409
    abrir_sesion(nuevo_id)
    return jsonify({"id": nuevo_id, "usuario": usuario}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict):
        return jsonify({"error": "Datos no válidos."}), 400
    usuario = str(datos.get("usuario", "")).strip()
    password = str(datos.get("password", ""))
    clave = (request.remote_addr, usuario.lower())

    espera = segundos_de_bloqueo(clave)
    if espera:
        return jsonify({"error": f"Demasiados intentos fallidos. Intenta de nuevo en {math.ceil(espera / 60)} min."}), 429

    with closing(get_connection()) as conn:
        fila = conn.execute(
            "SELECT id, usuario, password_hash FROM usuarios WHERE usuario = ? COLLATE NOCASE", (usuario,)
        ).fetchone()
    correcta = check_password_hash(fila["password_hash"] if fila else HASH_FALSO, password) and fila is not None
    if not correcta:  # el mismo mensaje exista o no el usuario
        anotar_fallo(clave)
        return jsonify({"error": "Usuario o contraseña incorrectos."}), 401
    intentos.pop(clave, None)
    abrir_sesion(fila["id"])
    return jsonify({"id": fila["id"], "usuario": fila["usuario"]})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# ============================== Validaciones ==============================
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


def ids_bancos(conn, usuario_id):
    return {f["id"] for f in conn.execute("SELECT id FROM bancos WHERE usuario_id = ?", (usuario_id,))}


def nombres_categoria(conn, usuario_id):
    """{'alimentación': 'Alimentación', ...} de ESTA cuenta, para validar sin importar mayúsculas."""
    return {
        f["nombre"].lower(): f["nombre"]
        for f in conn.execute("SELECT nombre FROM categorias WHERE usuario_id = ?", (usuario_id,))
    }


# ============================== Categorías ==============================
@app.route("/api/categorias", methods=["GET"])
@login_requerido
def listar_categorias():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT id, nombre FROM categorias WHERE usuario_id = ? "
            "ORDER BY (nombre = 'Otros' COLLATE NOCASE), nombre COLLATE NOCASE",
            (uid(),),
        ).fetchall()
    return jsonify([
        {"id": f["id"], "nombre": f["nombre"], "protegida": f["nombre"].lower() in FIJAS_MIN}
        for f in filas
    ])


@app.route("/api/categorias", methods=["POST"])
@login_requerido
def crear_categoria():
    datos = request.get_json(silent=True)
    nombre = " ".join(str(datos.get("nombre", "")).split()) if isinstance(datos, dict) else ""
    if not nombre:
        return jsonify({"error": "El nombre de la categoría es obligatorio."}), 400
    if len(nombre) > 40:
        return jsonify({"error": "El nombre es demasiado largo (máximo 40 caracteres)."}), 400
    try:
        with closing(get_connection()) as conn:
            if nombre.lower() in nombres_categoria(conn, uid()):
                return jsonify({"error": "Ya existe una categoría con ese nombre."}), 409
            with conn:
                cursor = conn.execute(
                    "INSERT INTO categorias (usuario_id, nombre) VALUES (?, ?)", (uid(), nombre)
                )
                nuevo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ya existe una categoría con ese nombre."}), 409
    return jsonify({"id": nuevo_id, "nombre": nombre, "protegida": False}), 201


@app.route("/api/categorias/<int:categoria_id>", methods=["DELETE"])
@login_requerido
def eliminar_categoria(categoria_id):
    """Quita una categoría. Si tiene gastos, hay que indicar a cuál moverlos (?reasignar=id)."""
    destino_id = request.args.get("reasignar", type=int)
    with closing(get_connection()) as conn:
        fila = conn.execute(
            "SELECT id, nombre FROM categorias WHERE id = ? AND usuario_id = ?", (categoria_id, uid())
        ).fetchone()
        if fila is None:
            return jsonify({"error": "Categoría no encontrada."}), 404
        if fila["nombre"].lower() in FIJAS_MIN:
            return jsonify({"error": "Esta categoría no se puede quitar."}), 400
        usados = conn.execute(
            "SELECT COUNT(*) FROM gastos WHERE categoria = ? COLLATE NOCASE AND usuario_id = ?",
            (fila["nombre"], uid()),
        ).fetchone()[0]
        destino = None
        if usados:
            if destino_id is None or destino_id == categoria_id:
                return jsonify({
                    "error": f"Hay {usados} {'gasto' if usados == 1 else 'gastos'} en esta categoría. Elige a cuál categoría moverlos.",
                    "gastos": usados,
                }), 409
            destino = conn.execute(
                "SELECT nombre FROM categorias WHERE id = ? AND usuario_id = ?", (destino_id, uid())
            ).fetchone()
            if destino is None:
                return jsonify({"error": "La categoría de destino no existe."}), 400
        with conn:
            if usados:
                conn.execute(
                    "UPDATE gastos SET categoria = ? WHERE categoria = ? COLLATE NOCASE AND usuario_id = ?",
                    (destino["nombre"], fila["nombre"], uid()),
                )
            conn.execute("DELETE FROM categorias WHERE id = ? AND usuario_id = ?", (categoria_id, uid()))
    return jsonify({"id": categoria_id, "movidos": usados})


# ============================== Bancos ==============================
@app.route("/api/bancos", methods=["GET"])
@login_requerido
def listar_bancos():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT id, nombre FROM bancos WHERE usuario_id = ? ORDER BY nombre COLLATE NOCASE", (uid(),)
        ).fetchall()
    return jsonify([fila_a_dict(f) for f in filas])


@app.route("/api/bancos", methods=["POST"])
@login_requerido
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
                cursor = conn.execute("INSERT INTO bancos (usuario_id, nombre) VALUES (?, ?)", (uid(), nombre))
                nuevo_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Ya existe un banco con ese nombre."}), 409
    return jsonify({"id": nuevo_id, "nombre": nombre}), 201


# ============================== Gastos ==============================
@app.route("/api/gastos", methods=["GET"])
@login_requerido
def listar_gastos():
    with closing(get_connection()) as conn:
        filas = conn.execute(
            "SELECT g.id, g.fecha, g.concepto, g.monto, g.categoria, g.descripcion, g.banco_id, b.nombre AS banco "
            "FROM gastos g LEFT JOIN bancos b ON b.id = g.banco_id "
            "WHERE g.usuario_id = ? ORDER BY g.fecha DESC, g.id DESC",
            (uid(),),
        ).fetchall()
    return jsonify([fila_a_dict(f) for f in filas])


@app.route("/api/gastos", methods=["POST"])
@login_requerido
def crear_gasto():
    with closing(get_connection()) as conn:
        gasto, error = validar_gasto(
            request.get_json(silent=True), ids_bancos(conn, uid()), nombres_categoria(conn, uid())
        )
        if error:
            return jsonify({"error": error}), 400
        with conn:
            # Consulta parametrizada: evita inyección SQL
            cursor = conn.execute(
                "INSERT INTO gastos (usuario_id, fecha, concepto, monto, categoria, banco_id, descripcion) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uid(), gasto["fecha"], gasto["concepto"], gasto["monto"], gasto["categoria"],
                 gasto["banco_id"], gasto["descripcion"]),
            )
            nuevo_id = cursor.lastrowid
    return jsonify({"id": nuevo_id, **gasto}), 201


def clave_gasto(fecha, concepto, monto, banco_id):
    return (fecha, str(concepto).strip().lower(), round(float(monto), 2), banco_id)


@app.route("/api/gastos/importar", methods=["POST"])
@login_requerido
def importar_gastos():
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict) or not isinstance(datos.get("gastos"), list):
        return jsonify({"error": "Se esperaba un JSON con la lista 'gastos'."}), 400
    if len(datos["gastos"]) > MAX_IMPORTAR:
        return jsonify({"error": f"Máximo {MAX_IMPORTAR} movimientos por importación."}), 400

    importados = duplicados = invalidos = 0
    with closing(get_connection()) as conn:
        # Todos los movimientos del archivo van al mismo banco (de esta cuenta)
        banco_id, error = validar_banco_id(datos.get("banco_id"), ids_bancos(conn, uid()))
        if error:
            return jsonify({"error": error}), 400
        if banco_id is None:
            return jsonify({"error": "Elige el banco del extracto."}), 400

        categorias = nombres_categoria(conn, uid())
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
                for f in conn.execute(
                    "SELECT fecha, concepto, monto, banco_id FROM gastos WHERE usuario_id = ?", (uid(),)
                )
            )
            for g in validos:
                clave = clave_gasto(g["fecha"], g["concepto"], g["monto"], g["banco_id"])
                if existentes[clave] > 0:
                    existentes[clave] -= 1
                    duplicados += 1
                    continue
                conn.execute(
                    "INSERT INTO gastos (usuario_id, fecha, concepto, monto, categoria, banco_id, descripcion) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (uid(), g["fecha"], g["concepto"], g["monto"], g["categoria"], g["banco_id"], g["descripcion"]),
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
@login_requerido
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
@login_requerido
def actualizar_gasto(gasto_id):
    """Edita la categoría y/o la descripción de un gasto."""
    datos = request.get_json(silent=True)
    if not isinstance(datos, dict) or not ({"categoria", "descripcion"} & datos.keys()):
        return jsonify({"error": "Solo se puede actualizar la categoría o la descripción."}), 400
    campos, valores = [], []
    with closing(get_connection()) as conn:
        if "categoria" in datos:
            categoria = nombres_categoria(conn, uid()).get(str(datos.get("categoria") or "").strip().lower())
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
            cursor = conn.execute(
                f"UPDATE gastos SET {', '.join(campos)} WHERE id = ? AND usuario_id = ?",
                (*valores, gasto_id, uid()),
            )
        if cursor.rowcount == 0:
            return jsonify({"error": "Gasto no encontrado."}), 404
        fila = conn.execute("SELECT id, categoria, descripcion FROM gastos WHERE id = ?", (gasto_id,)).fetchone()
    return jsonify(fila_a_dict(fila))


@app.route("/api/gastos/asignar-banco", methods=["POST"])
@login_requerido
def asignar_banco():
    """Asigna un banco a todos los gastos de esta cuenta que quedaron sin banco."""
    datos = request.get_json(silent=True)
    with closing(get_connection()) as conn:
        banco_id, error = validar_banco_id(
            datos.get("banco_id") if isinstance(datos, dict) else None, ids_bancos(conn, uid())
        )
        if error or banco_id is None:
            return jsonify({"error": error or "Elige un banco."}), 400
        with conn:
            cursor = conn.execute(
                "UPDATE gastos SET banco_id = ? WHERE banco_id IS NULL AND usuario_id = ?", (banco_id, uid())
            )
    return jsonify({"asignados": cursor.rowcount})


@app.route("/api/gastos/<int:gasto_id>", methods=["DELETE"])
@login_requerido
def eliminar_gasto(gasto_id):
    with closing(get_connection()) as conn:
        with conn:
            cursor = conn.execute("DELETE FROM gastos WHERE id = ? AND usuario_id = ?", (gasto_id, uid()))
    if cursor.rowcount == 0:
        return jsonify({"error": "Gasto no encontrado."}), 404
    return jsonify({"mensaje": "Gasto eliminado.", "id": gasto_id})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)