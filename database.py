import sqlite3
import os

# Definimos el nombre del archivo de la base de datos que se creará localmente en la carpeta
DB_NAME = "gastos.db"

def get_connection():
    """
    Función auxiliar (helper) para centralizar la conexión con SQLite.
    Evita repetir código cada vez que necesitemos consultar o insertar datos.
    """
    # Conecta con el archivo de SQLite (si no existe físicamente, lo crea automáticamente)
    conn = sqlite3.connect(DB_NAME)
    
    # Configura el row_factory para que los resultados de las consultas SQL 
    # se comporten como diccionarios (clave-valor), facilitando leer columnas por su nombre.
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    Inicializa el esquema de la base de datos creando las tablas necesarias.
    """
    # Obtenemos la conexión activa llamando a nuestra función auxiliar
    conn = get_connection()
    
    # Creamos un cursor: el objeto encargado de enviar y ejecutar las sentencias SQL
    cursor = conn.cursor()
    
    # Ejecutamos el comando SQL DDL para crear la tabla 'gastos'
    # 'IF NOT EXISTS' evita que se sobrescriba o dé error si la tabla ya fue creada antes.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            concepto TEXT NOT NULL,
            monto REAL NOT NULL,
            categoria TEXT NOT NULL
        )
    """)
    
    # Confirmamos y guardamos permanentemente los cambios (commit) en el archivo de la BD
    conn.commit()
    
    # Cerramos la conexión para liberar recursos de memoria y del sistema operativo
    conn.close()
    
    # Mensaje de retroalimentación en la consola para confirmar el éxito de la operación
    print(f"[DB] Base de datos '{DB_NAME}' inicializada correctamente.")

# Condicional de ejecución estándar en Python
if __name__ == "__main__":
    # Este bloque solo se ejecuta si corremos este archivo directamente en la terminal (python database.py)
    # Si este archivo es importado desde otro módulo (como app.py), este bloque se ignora por seguridad.
    init_db()