"""Gestión de la conexión a SQLite y creación de tablas."""
import os
import sqlite3
from contextlib import closing

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gastos.db")


def get_connection():
    """Devuelve una conexión nueva con filas accesibles por nombre de columna."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Crea la tabla 'gastos' si todavía no existe."""
    with closing(get_connection()) as conn:
        with conn:  # confirma (commit) automáticamente al salir
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS gastos (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    fecha     TEXT NOT NULL,
                    concepto  TEXT NOT NULL,
                    monto     REAL NOT NULL,
                    categoria TEXT NOT NULL
                )
                """
            )