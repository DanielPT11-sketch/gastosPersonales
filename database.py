"""Gestión de la conexión a SQLite, creación de tablas y migraciones."""
import os
import sqlite3
from contextlib import closing

CATEGORIAS_BASE = ["Alimentación", "Transporte", "Servicios", "Vivienda", "Salud",
                   "Ocio", "Educación", "Retiros y avances", "Otros"]
# Estas dos no se pueden quitar: "Retiros y avances" lleva descripción y "Otros" es la de respaldo
CATEGORIAS_FIJAS = ("Otros", "Retiros y avances")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gastos.db")


def get_connection():
    """Devuelve una conexión nueva con filas accesibles por nombre de columna."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _columnas(conn, tabla):
    return [f["name"] for f in conn.execute(f"PRAGMA table_info({tabla})")]


def _tabla_nombres_por_usuario(conn, tabla):
    """bancos y categorias: el nombre es único POR USUARIO (dos cuentas pueden tener 'Efectivo').
    En bases antiguas el nombre era único para todos, así que se reconstruye la tabla
    (procedimiento recomendado por SQLite: crear nueva, copiar, borrar la vieja, renombrar)."""
    esquema = f"""
        CREATE TABLE {{nombre}} (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER REFERENCES usuarios(id),
            nombre     TEXT NOT NULL COLLATE NOCASE,
            UNIQUE (usuario_id, nombre)
        )"""
    existe = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (tabla,)).fetchone()
    if not existe:
        conn.execute(esquema.format(nombre=tabla))
    elif "usuario_id" not in _columnas(conn, tabla):
        conn.execute(esquema.format(nombre=f"{tabla}_nueva"))
        conn.execute(f"INSERT INTO {tabla}_nueva (id, nombre) SELECT id, nombre FROM {tabla}")
        conn.execute(f"DROP TABLE {tabla}")
        conn.execute(f"ALTER TABLE {tabla}_nueva RENAME TO {tabla}")


def init_db():
    """Crea las tablas si no existen y migra bases de datos antiguas sin perder datos."""
    with closing(get_connection()) as conn:
        with conn:  # confirma (commit) automáticamente al salir
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS usuarios (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    usuario       TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    creado        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS gastos (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha       TEXT NOT NULL,
                    concepto    TEXT NOT NULL,
                    monto       REAL NOT NULL,
                    categoria   TEXT NOT NULL,
                    banco_id    INTEGER REFERENCES bancos(id),
                    descripcion TEXT,
                    usuario_id  INTEGER REFERENCES usuarios(id)
                )
                """
            )
            columnas = _columnas(conn, "gastos")
            if "banco_id" not in columnas:
                conn.execute("ALTER TABLE gastos ADD COLUMN banco_id INTEGER REFERENCES bancos(id)")
            if "descripcion" not in columnas:
                conn.execute("ALTER TABLE gastos ADD COLUMN descripcion TEXT")
            if "usuario_id" not in columnas:
                conn.execute("ALTER TABLE gastos ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_gastos_usuario ON gastos (usuario_id, fecha)")

            _tabla_nombres_por_usuario(conn, "bancos")
            _tabla_nombres_por_usuario(conn, "categorias")
    # Los datos anteriores a las cuentas (usuario_id vacío) pasan a la primera cuenta que se cree.


def crear_usuario(conn, usuario, password_hash):
    """Crea la cuenta y la deja lista (categorías base). Debe llamarse dentro de 'with conn'."""
    uid = conn.execute(
        "INSERT INTO usuarios (usuario, password_hash) VALUES (?, ?)", (usuario, password_hash)
    ).lastrowid

    # La primera cuenta se queda con los datos que ya existían antes de haber usuarios
    if conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 1:
        for tabla in ("bancos", "categorias", "gastos"):
            conn.execute(f"UPDATE {tabla} SET usuario_id = ? WHERE usuario_id IS NULL", (uid,))

    # Categorías que sus gastos ya usan (por si vienen de una base muy antigua)
    conn.execute(
        "INSERT OR IGNORE INTO categorias (usuario_id, nombre) "
        "SELECT DISTINCT ?, TRIM(categoria) FROM gastos "
        "WHERE usuario_id = ? AND TRIM(COALESCE(categoria, '')) <> ''",
        (uid, uid),
    )
    tiene = {f["nombre"].lower() for f in conn.execute("SELECT nombre FROM categorias WHERE usuario_id = ?", (uid,))}
    base = CATEGORIAS_BASE if not tiene else CATEGORIAS_FIJAS  # cuenta nueva: todas; con datos: solo las fijas
    for nombre in base:
        if nombre.lower() not in tiene:
            conn.execute("INSERT INTO categorias (usuario_id, nombre) VALUES (?, ?)", (uid, nombre))
    return uid