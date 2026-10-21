import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../api.service';
import { moneda, suma } from '../formato';

@Component({
  selector: 'app-bancos',
  imports: [FormsModule],
  template: `
    <header class="pagina-cab">
      <h1>Bancos</h1>
      <p>Crea los bancos o cuentas desde donde registras tus gastos (puedes crear uno llamado «Efectivo»).</p>
    </header>

    @if (api.pendientes() > 0) {
      <section class="panel aviso" aria-labelledby="titulo-pendientes">
        <h2 id="titulo-pendientes">Gastos sin banco</h2>
        <p>Tienes {{ api.pendientes() }} {{ api.pendientes() === 1 ? 'gasto' : 'gastos' }} sin banco. Todos deben tener uno.</p>
        <form class="fila-form" (ngSubmit)="asignar()">
          <select name="destino" [(ngModel)]="destinoId" aria-label="Banco para asignar">
            <option [ngValue]="null" disabled>{{ api.bancos().length ? 'Elige un banco' : 'Primero crea un banco' }}</option>
            @for (b of api.bancos(); track b.id) {
              <option [ngValue]="b.id">{{ b.nombre }}</option>
            }
          </select>
          <button type="submit" class="btn-sec">Asignar a este banco</button>
        </form>
      </section>
    }

    <section class="panel">
      <h2>Nuevo banco</h2>
      <form class="fila-form" (ngSubmit)="crear()" novalidate>
        <div class="campo">
          <label for="nombre-banco">Nombre del banco o cuenta</label>
          <input id="nombre-banco" name="nombre" maxlength="60" placeholder="Ej. Bancolombia ahorros" autocomplete="off" [(ngModel)]="nombre" />
        </div>
        <button type="submit" class="btn">Crear banco</button>
      </form>
      @if (mensaje()) {
        <p class="mensaje" [class.ok]="!esError()" role="alert">{{ mensaje() }}</p>
      }
    </section>

    <section class="panel">
      <h2>Mis bancos</h2>
      @if (resumen().length === 0) {
        <p class="vacio">Aún no has creado bancos.</p>
      } @else {
        <ul class="lista">
          @for (r of resumen(); track r.banco.id) {
            <li class="item">
              <div class="item-info">
                <p class="item-titulo">{{ r.banco.nombre }}</p>
                <p class="item-meta">{{ r.n }} {{ r.n === 1 ? 'gasto' : 'gastos' }}</p>
              </div>
              <strong class="item-monto">{{ moneda(r.total) }}</strong>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class BancosComponent {
  readonly api = inject(ApiService);
  readonly moneda = moneda;
  nombre = '';
  destinoId: number | null = null;
  readonly mensaje = signal('');
  readonly esError = signal(false);

  readonly resumen = computed(() =>
    this.api.bancos().map((banco) => {
      const gastos = this.api.gastos().filter((g) => g.banco_id === banco.id);
      return { banco, n: gastos.length, total: suma(gastos) };
    }),
  );

  constructor() {
    effect(() => {
      const bancos = this.api.bancos();
      untracked(() => {
        if (this.destinoId === null && bancos.length === 1) this.destinoId = bancos[0].id;
      });
    });
  }

  private avisar(texto: string, error: boolean) {
    this.mensaje.set(texto);
    this.esError.set(error);
  }

  async crear() {
    const nombre = this.nombre.trim();
    if (!nombre) return this.avisar('Escribe el nombre del banco.', true);
    try {
      const banco = await this.api.crearBanco(nombre);
      this.nombre = '';
      this.avisar(`Banco «${banco.nombre}» creado.`, false);
    } catch (e) {
      this.avisar(mensajeError(e, 'No se pudo crear el banco.'), true);
    }
  }

  async asignar() {
    if (this.destinoId === null) return this.avisar('Elige un banco para asignar.', true);
    try {
      await this.api.asignarPendientes(this.destinoId);
      this.avisar('Gastos asignados.', false);
    } catch (e) {
      this.avisar(mensajeError(e, 'No se pudieron asignar los gastos.'), true);
    }
  }
}
