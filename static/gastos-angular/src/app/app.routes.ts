import { Routes } from '@angular/router';

// Cada sección es un componente independiente que se carga solo cuando se visita (lazy loading)
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'inicio',
    title: 'Inicio · Mis gastos',
    loadComponent: () => import('./paginas/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'agregar-gasto',
    title: 'Agregar gasto · Mis gastos',
    loadComponent: () => import('./paginas/agregar-gasto.component').then((m) => m.AgregarGastoComponent),
  },
  {
    path: 'historial',
    title: 'Historial · Mis gastos',
    loadComponent: () => import('./paginas/historial.component').then((m) => m.HistorialComponent),
  },
  {
    path: 'bancos',
    title: 'Bancos · Mis gastos',
    loadComponent: () => import('./paginas/bancos.component').then((m) => m.BancosComponent),
  },
  {
    path: 'categorias',
    title: 'Categorías · Mis gastos',
    loadComponent: () => import('./paginas/categorias.component').then((m) => m.CategoriasComponent),
  },
  { path: '**', redirectTo: 'inicio' },
];
