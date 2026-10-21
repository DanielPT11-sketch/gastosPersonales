# Mis gastos · prototipo Angular

Front-end en Angular 20 que usa la misma API de Flask (`/api/gastos`, `/api/bancos`, `/api/categorias`).

Secciones (cada una es un componente independiente con carga diferida), en `src/app/paginas/`:
Inicio · Agregar Gasto · Historial · Bancos · Categorías. El encabezado fijo con el menú está en `src/app/app.ts`.

## Volver a compilar (solo si cambias el código)
Requiere Node 20.19+ o 22.12+.

    npm install
    npx ng build --base-href /static/angular/

Copia el contenido de `dist/gastos-angular/browser/` a `static/angular/` del proyecto Flask.

## Desarrollo con recarga automática
Con Flask corriendo en el puerto 5000, en otra terminal:

    npx ng serve --proxy-config proxy.conf.json

y abre http://localhost:4200
