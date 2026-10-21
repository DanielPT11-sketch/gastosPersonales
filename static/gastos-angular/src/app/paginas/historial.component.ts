import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CATEGORIA_RETIROS, Gasto, mensajeError } from '../api.service';
import { fechaLegible, moneda, rangoAnio, rangoMes, suma } from '../formato';

@Component({
  selector: 'app-historial',
  imports: [FormsModule, NgTemplateOutlet],
  template: `
    <header class="pagina-cab">
      <h1>Historial</h1>
      <p>Consulta, filtra y corrige tus gastos registrados.</p>
    </header>

    <section class="panel filtros" aria-label="Filtros">
      <div class="campo">
        <label for="desde">Desde</label>
        <input id="desde" type="date" [ngModel]="desde()" (ngModelChange)="desde.set($event)" />
      </div>
      <div class="campo">
        <label for="hasta">Hasta</label>
        <input id="hasta" type="date" [ngModel]="hasta()" (ngModelChange)="hasta.set($event)" />
      </div>
      <div class="campo">
        <label for="filtro-banco">Banco</label>
        <select id="filtro-banco" [ngModel]="bancoFiltro()" (ngModelChange)="bancoFiltro.set($event)">
          <option value="todos">Todos los bancos</option>
          @if (api.pendientes() > 0) {
            <option value="ninguno">Sin banco asignado</option>
          }
          @for (b of api.bancos(); track b.id) {
            <option [value]="b.id">{{ b.nombre }}</option>
          }
        </select>
      </div>
      <div class="atajos">
        <button type="button" class="btn-sec" (click)="ponerMes()">Este mes</button>
        <button type="button" class="btn-sec" (click)="ponerAnio()">Este año</button>
        <button type="button" class="btn-sec" (click)="verTodo()">Ver todo</button>
      </div>
    </section>

    <section class="panel">
      <div class="cab-lista">
        <h2>{{ filtrados().length }} {{ filtrados().length === 1 ? 'gasto' : 'gastos' }} · {{ moneda(total()) }}</h2>
        <div class="vistas" role="group" aria-label="Vista del historial">
          <button type="button" [attr.aria-pressed]="vista() === 'general'" (click)="vista.set('general')">General</button>
          <button type="button" [attr.aria-pressed]="vista() === 'banco'" (click)="vista.set('banco')">Por banco</button>
        </div>
      </div>

      @if (error()) {
        <p class="mensaje" role="alert">{{ error() }}</p>
      }
      @if (rangoInvalido()) {
        <p class="mensaje" role="alert">La fecha «Desde» es posterior a «Hasta». Corrige el rango.</p>
      } @else if (filtrados().length === 0) {
        <p class="vacio">No hay gastos con estos filtros.</p>
      } @else if (vista() === 'general') {
        <ul class="lista">
          @for (g of filtrados(); track g.id) {
            <ng-container [ngTemplateOutlet]="fila" [ngTemplateOutletContext]="{ $implicit: g }" />
          }
        </ul>
      } @else {
        @for (grupo of grupos(); track grupo.nombre) {
          <section class="grupo">
            <div class="grupo-cab">
              <h3>{{ grupo.nombre }}</h3>
              <span>{{ grupo.items.length }} {{ grupo.items.length === 1 ? 'gasto' : 'gastos' }} · {{ moneda(grupo.total) }}</span>
            </div>
            <ul class="lista">
              @for (g of grupo.items; track g.id) {
                <ng-container [ngTemplateOutlet]="fila" [ngTemplateOutletContext]="{ $implicit: g }" />
              }
            </ul>
          </section>
        }
      }
    </section>

    <ng-template #fila let-g>
      <li class="item">
        <div class="item-info">
          <p class="item-titulo">{{ g.concepto }}</p>
          <p class="item-meta">{{ g.categoria }} · {{ fecha(g.fecha) }}{{ g.banco ? ' · ' + g.banco : '' }}</p>
          @if (g.categoria === retiros && g.descripcion) {
            <p class="item-desc">{{ g.descripcion }}</p>
          }
        </div>
        <strong class="item-monto">{{ moneda(g.monto) }}</strong>
        <div class="item-acciones">
          <button type="button" class="enlace" (click)="abrirEditor(g)">Editar</button>
          <button type="button" class="enlace peligro" (click)="eliminar(g)">Eliminar</button>
        </div>
        @if (editando() === g.id) {
          <form class="editor" (ngSubmit)="guardarEdicion(g)">
            <select name="categoria" [(ngModel)]="edCategoria" aria-label="Categoría">
              @for (c of api.categorias(); track c.id) {
                <option [value]="c.nombre">{{ c.nombre }}</option>
              }
            </select>
            @if (edCategoria === retiros) {
              <input name="descripcion" [(ngModel)]="edDescripcion" maxlength="200" placeholder="¿En qué se usó este dinero?" aria-label="Descripción" />
            }
            <button type="submit" class="btn-sec">Guardar</button>
            <button type="button" class="enlace" (click)="editando.set(null)">Cancelar</button>
          </form>
        }
      </li>
    </ng-template>
  `,
})
export class HistorialComponent {
  readonly api = inject(ApiService);
  readonly retiros = CATEGORIA_RETIROS;
  readonly moneda = moneda;
  readonly fecha = fechaLegible;

  readonly desde = signal(rangoMes()[0]);
  readonly hasta = signal(rangoMes()[1]);
  readonly bancoFiltro = signal('todos');
  readonly vista = signal<'general' | 'banco'>('general');
  readonly editando = signal<number | null>(null);
  readonly error = signal('');
  edCategoria = '';
  edDescripcion = '';

  readonly rangoInvalido = computed(() => !!this.desde() && !!this.hasta() && this.desde() > this.hasta());

  readonly filtrados = computed(() => {
    if (this.rangoInvalido()) return [];
    const d = this.desde();
    const h = this.hasta();
    const b = this.bancoFiltro();
    return this.api.gastos().filter(
      (g) =>
        (!d || g.fecha >= d) &&
        (!h || g.fecha <= h) &&
        (b === 'todos' || (b === 'ninguno' ? g.banco_id == null : String(g.banco_id) === b)),
    );
  });

  readonly total = computed(() => suma(this.filtrados()));

  readonly grupos = computed(() => {
    const items = this.filtrados();
    const bancos = this.api.bancos();
    const orden: (number | null)[] = [...bancos.map((b) => b.id), null];
    return orden
      .map((id) => {
        const delBanco = items.filter((g) => (g.banco_id ?? null) === id);
        const nombre = id === null ? 'Sin banco asignado' : (bancos.find((b) => b.id === id)?.nombre ?? 'Banco');
        return { nombre, items: delBanco, total: suma(delBanco) };
      })
      .filter((g) => g.items.length > 0);
  });

  ponerMes() { [this.desde, this.hasta].forEach((s, i) => s.set(rangoMes()[i])); }
  ponerAnio() { [this.desde, this.hasta].forEach((s, i) => s.set(rangoAnio()[i])); }
  verTodo() { this.desde.set(''); this.hasta.set(''); }

  abrirEditor(g: Gasto) {
    this.edCategoria = g.categoria;
    this.edDescripcion = g.descripcion ?? '';
    this.editando.set(this.editando() === g.id ? null : g.id);
  }

  async guardarEdicion(g: Gasto) {
    this.error.set('');
    const cambios: { categoria?: string; descripcion?: string } = {};
    if (this.edCategoria !== g.categoria) cambios.categoria = this.edCategoria;
    if (this.edCategoria === CATEGORIA_RETIROS) cambios.descripcion = this.edDescripcion.trim();
    try {
      if (Object.keys(cambios).length) await this.api.actualizarGasto(g.id, cambios);
      this.editando.set(null);
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo guardar el cambio.'));
    }
  }

  async eliminar(g: Gasto) {
    if (!confirm(`¿Eliminar «${g.concepto}»?`)) return;
    this.error.set('');
    try {
      await this.api.eliminarGasto(g.id);
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo eliminar el gasto.'));
    }
  }
}
