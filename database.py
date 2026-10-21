"""Gestión de la conexión a SQLite y creación de tablas."""
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


def init_db():
    """Crea las tablas si no existen y migra bases de datos antiguas."""
    with closing(get_connection()) as conn:
        with conn:  # confirma (commit) automáticamente al salir
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bancos (
                    id     INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL UNIQUE COLLATE NOCASE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS gastos (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha     TEXT NOT NULL,
                    concepto  TEXT NOT NULL,
                    monto     REAL NOT NULL,
                    categoria TEXT NOT NULL,
                    banco_id  INTEGER REFERENCES bancos(id),
                    descripcion TEXT
                )
                """
            )
            # Migración: bases creadas antes de existir los bancos no tienen banco_id.
            # Sus gastos quedan sin banco (NULL); no se pierde nada.
            columnas = [f["name"] for f in conn.execute("PRAGMA table_info(gastos)")]
            if "banco_id" not in columnas:
                conn.execute("ALTER TABLE gastos ADD COLUMN banco_id INTEGER REFERENCES bancos(id)")
            if "descripcion" not in columnas:
                conn.execute("ALTER TABLE gastos ADD COLUMN descripcion TEXT")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS categorias (
                    id     INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT NOT NULL UNIQUE COLLATE NOCASE
                )
                """
            )
            if conn.execute("SELECT COUNT(*) FROM categorias").fetchone()[0] == 0:
                conn.executemany("INSERT OR IGNORE INTO categorias (nombre) VALUES (?)",
                                 [(n,) for n in CATEGORIAS_BASE])
            # Categorías que los gastos existentes ya usan (para no dejar ninguna huérfana)
            conn.execute(
                "INSERT OR IGNORE INTO categorias (nombre) "
                "SELECT DISTINCT TRIM(categoria) FROM gastos WHERE TRIM(COALESCE(categoria, '')) <> ''"
            )
            conn.executemany("INSERT OR IGNORE INTO categorias (nombre) VALUES (?)",
                             [(n,) for n in CATEGORIAS_FIJAS])