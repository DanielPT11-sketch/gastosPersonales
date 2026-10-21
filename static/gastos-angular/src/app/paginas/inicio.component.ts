import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { agrupar, fechaLegible, hoyISO, moneda, suma } from '../formato';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  template: `
    <header class="pagina-cab">
      <h1>Inicio</h1>
      <p>Resumen de tus gastos de {{ nombreMes }}.</p>
    </header>

    @if (api.pendientes() > 0) {
      <p class="aviso" role="status">
        Tienes {{ api.pendientes() }} {{ api.pendientes() === 1 ? 'gasto' : 'gastos' }} sin banco.
        <a routerLink="/bancos">Asígnalos en Bancos</a>.
      </p>
    }

    <section class="tarjetas" aria-label="Totales">
      <article class="tarjeta destacada">
        <span>Gastado en {{ nombreMes }}</span>
        <strong>{{ moneda(totalMes()) }}</strong>
        <small>{{ delMes().length }} {{ delMes().length === 1 ? 'gasto' : 'gastos' }}</small>
      </article>
      <article class="tarjeta">
        <span>Total acumulado</span>
        <strong>{{ moneda(totalGeneral()) }}</strong>
        <small>{{ api.gastos().length }} gastos en total</small>
      </article>
      <article class="tarjeta">
        <span>Bancos · Categorías</span>
        <strong>{{ api.bancos().length }} · {{ api.categorias().length }}</strong>
        <small>creados hasta ahora</small>
      </article>
    </section>

    <div class="dos-columnas">
      <section class="panel">
        <h2>Por categoría</h2>
        @if (porCategoria().length === 0) {
          <p class="vacio">Aún no hay gastos este mes.</p>
        } @else {
          <ul class="barras">
            @for (x of porCategoria(); track x.nombre) {
              <li>
                <div class="barra-fila"><span>{{ x.nombre }}</span><strong>{{ moneda(x.total) }}</strong></div>
                <div class="barra"><span [style.width.%]="x.pct"></span></div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel">
        <h2>Por banco</h2>
        @if (porBanco().length === 0) {
          <p class="vacio">Aún no hay gastos este mes.</p>
        } @else {
          <ul class="barras">
            @for (x of porBanco(); track x.nombre) {
              <li>
                <div class="barra-fila"><span>{{ x.nombre }}</span><strong>{{ moneda(x.total) }}</strong></div>
                <div class="barra"><span [style.width.%]="x.pct"></span></div>
              </li>
            }
          </ul>
        }
      </section>
    </div>

    <section class="panel">
      <div class="cab-lista">
        <h2>Últimos gastos</h2>
        <a class="enlace" routerLink="/historial">Ver todo el historial</a>
      </div>
      @if (recientes().length === 0) {
        <p class="vacio">Todavía no hay gastos. <a routerLink="/agregar-gasto">Agrega el primero</a>.</p>
      } @else {
        <ul class="lista">
          @for (g of recientes(); track g.id) {
            <li class="item">
              <div class="item-info">
                <p class="item-titulo">{{ g.concepto }}</p>
                <p class="item-meta">{{ g.categoria }} · {{ fecha(g.fecha) }}{{ g.banco ? ' · ' + g.banco : '' }}</p>
              </div>
              <strong class="item-monto">{{ moneda(g.monto) }}</strong>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class InicioComponent {
  readonly api = inject(ApiService);
  readonly moneda = moneda;
  readonly fecha = fechaLegible;
  readonly nombreMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date());
  private readonly mes = hoyISO().slice(0, 7);

  readonly delMes = computed(() => this.api.gastos().filter((g) => g.fecha.startsWith(this.mes)));
  readonly totalMes = computed(() => suma(this.delMes()));
  readonly totalGeneral = computed(() => suma(this.api.gastos()));
  readonly porCategoria = computed(() => agrupar(this.delMes(), (g) => g.categoria));
  readonly porBanco = computed(() => agrupar(this.delMes(), (g) => g.banco ?? 'Sin banco asignado'));
  readonly recientes = computed(() => this.api.gastos().slice(0, 5));
}
