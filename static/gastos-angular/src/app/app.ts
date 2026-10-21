import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="encabezado">
      <div class="encabezado-interior">
        <a class="marca" routerLink="/inicio">Mis gastos</a>
        <nav aria-label="Secciones">
          <ul>
            @for (e of enlaces; track e.ruta) {
              <li>
                <a [routerLink]="'/' + e.ruta" routerLinkActive="activo" ariaCurrentWhenActive="page">{{ e.texto }}</a>
              </li>
            }
          </ul>
        </nav>
      </div>
    </header>

    <main class="contenido">
      @if (api.errorCarga()) {
        <p class="aviso aviso-error" role="alert">{{ api.errorCarga() }}</p>
      }
      <router-outlet />
    </main>
  `,
})
export class App {
  readonly api = inject(ApiService);
  readonly enlaces = [
    { ruta: 'inicio', texto: 'Inicio' },
    { ruta: 'agregar-gasto', texto: 'Agregar Gasto' },
    { ruta: 'historial', texto: 'Historial' },
    { ruta: 'bancos', texto: 'Bancos' },
    { ruta: 'categorias', texto: 'Categorías' },
  ];
}
