import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, CATEGORIA_RETIROS, mensajeError } from '../api.service';
import { hoyISO } from '../formato';

@Component({
  selector: 'app-agregar-gasto',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="pagina-cab">
      <h1>Agregar gasto</h1>
      <p>Registra un gasto nuevo. Todo gasto debe pertenecer a un banco.</p>
    </header>

    @if (api.bancos().length === 0) {
      <p class="aviso" role="status">
        Aún no tienes bancos. <a routerLink="/bancos">Crea el primero</a> para poder registrar gastos.
      </p>
    }

    <section class="panel">
      <form (ngSubmit)="guardar()" novalidate>
        <div class="fila">
          <div class="campo">
            <label for="fecha">Fecha</label>
            <input id="fecha" name="fecha" type="date" [(ngModel)]="fecha" />
          </div>
          <div class="campo">
            <label for="banco">Banco</label>
            <select id="banco" name="banco" [(ngModel)]="bancoId">
              <option [ngValue]="null" disabled>{{ api.bancos().length ? 'Elige un banco' : 'Primero crea un banco' }}</option>
              @for (b of api.bancos(); track b.id) {
                <option [ngValue]="b.id">{{ b.nombre }}</option>
              }
            </select>
          </div>
        </div>

        <div class="fila">
          <div class="campo">
            <label for="categoria">Categoría</label>
            <select id="categoria" name="categoria" [(ngModel)]="categoria">
              @for (c of api.categorias(); track c.id) {
                <option [value]="c.nombre">{{ c.nombre }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="monto">Monto</label>
            <input id="monto" name="monto" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" [(ngModel)]="monto" />
          </div>
        </div>

        <div class="campo">
          <label for="concepto">Concepto</label>
          <input id="concepto" name="concepto" type="text" maxlength="120" placeholder="Ej. Mercado de la semana" autocomplete="off" [(ngModel)]="concepto" />
        </div>

        @if (categoria === retiros) {
          <div class="campo">
            <label for="descripcion">Descripción del retiro o avance (opcional)</label>
            <input id="descripcion" name="descripcion" type="text" maxlength="200" placeholder="Ej. Pago al proveedor" autocomplete="off" [(ngModel)]="descripcion" />
          </div>
        }

        @if (mensaje()) {
          <p class="mensaje" [class.ok]="!esError()" role="alert">{{ mensaje() }}</p>
        }
        <button class="btn" type="submit" [disabled]="guardando()">Guardar gasto</button>
      </form>
    </section>
  `,
})
export class AgregarGastoComponent {
  readonly api = inject(ApiService);
  readonly retiros = CATEGORIA_RETIROS;

  fecha = hoyISO();
  bancoId: number | null = null;
  categoria = '';
  concepto = '';
  monto: number | null = null;
  descripcion = '';

  readonly mensaje = signal('');
  readonly esError = signal(false);
  readonly guardando = signal(false);

  constructor() {
    // Valores iniciales cuando llegan los datos: el único banco, y la primera categoría
    effect(() => {
      const bancos = this.api.bancos();
      const categorias = this.api.categorias();
      untracked(() => {
        if (this.bancoId === null && bancos.length === 1) this.bancoId = bancos[0].id;
        if (!this.categoria && categorias.length) this.categoria = categorias[0].nombre;
      });
    });
  }

  private avisar(texto: string, error: boolean) {
    this.mensaje.set(texto);
    this.esError.set(error);
  }

  async guardar() {
    const concepto = this.concepto.trim();
    const monto = Number(this.monto);
    if (!this.fecha) return this.avisar('Elige una fecha.', true);
    if (this.bancoId === null) {
      return this.avisar(this.api.bancos().length ? 'Elige el banco del gasto.' : 'Primero crea un banco en la sección Bancos.', true);
    }
    if (!concepto) return this.avisar('Escribe un concepto.', true);
    if (!Number.isFinite(monto) || monto <= 0) return this.avisar('Ingresa un monto mayor que cero.', true);

    this.guardando.set(true);
    try {
      await this.api.crearGasto({
        fecha: this.fecha,
        concepto,
        monto,
        categoria: this.categoria,
        banco_id: this.bancoId,
        descripcion: this.categoria === CATEGORIA_RETIROS ? this.descripcion.trim() : '',
      });
      this.concepto = '';
      this.monto = null;
      this.descripcion = '';
      this.avisar('Gasto guardado. Lo verás en el Historial.', false);
    } catch (e) {
      this.avisar(mensajeError(e, 'No se pudo guardar el gasto.'), true);
    } finally {
      this.guardando.set(false);
    }
  }
}
