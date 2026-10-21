import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, mensajeError } from '../api.service';

interface FilaCategoria {
  id: number;
  nombre: string;
  protegida: boolean;
  n: number;
}

@Component({
  selector: 'app-categorias',
  imports: [FormsModule],
  template: `
    <header class="pagina-cab">
      <h1>Categorías</h1>
      <p>Crea y quita las categorías con las que clasificas tus gastos.</p>
    </header>

    <section class="panel">
      <h2>Nueva categoría</h2>
      <form class="fila-form" (ngSubmit)="crear()" novalidate>
        <div class="campo">
          <label for="nombre-categoria">Nombre</label>
          <input id="nombre-categoria" name="nombre" maxlength="40" placeholder="Ej. Mascotas" autocomplete="off" [(ngModel)]="nombre" />
        </div>
        <button type="submit" class="btn">Crear categoría</button>
      </form>
      @if (mensaje()) {
        <p class="mensaje" [class.ok]="!esError()" role="alert">{{ mensaje() }}</p>
      }
    </section>

    <section class="panel">
      <h2>Mis categorías</h2>
      <ul class="lista">
        @for (c of filas(); track c.id) {
          <li class="item">
            <div class="item-info">
              <p class="item-titulo">{{ c.nombre }}</p>
              <p class="item-meta">{{ c.n }} {{ c.n === 1 ? 'gasto' : 'gastos' }}</p>
            </div>
            @if (c.protegida) {
              <span class="etiqueta" title="Esta categoría no se puede quitar">Fija</span>
            } @else {
              <button type="button" class="enlace peligro" (click)="quitar(c)" [attr.aria-label]="'Quitar la categoría ' + c.nombre">Quitar</button>
            }
            @if (quitando() === c.id) {
              <form class="editor" (ngSubmit)="confirmar(c)">
                <span>Mover sus {{ c.n }} {{ c.n === 1 ? 'gasto' : 'gastos' }} a:</span>
                <select name="destino" [(ngModel)]="destinoId" aria-label="Categoría de destino">
                  @for (o of otras(c); track o.id) {
                    <option [ngValue]="o.id">{{ o.nombre }}</option>
                  }
                </select>
                <button type="submit" class="btn-sec">Quitar y mover</button>
                <button type="button" class="enlace" (click)="quitando.set(null)">Cancelar</button>
              </form>
            }
          </li>
        }
      </ul>
    </section>
  `,
})
export class CategoriasComponent {
  readonly api = inject(ApiService);
  nombre = '';
  destinoId: number | null = null;
  readonly quitando = signal<number | null>(null);
  readonly mensaje = signal('');
  readonly esError = signal(false);

  readonly filas = computed<FilaCategoria[]>(() =>
    this.api.categorias().map((c) => ({
      ...c,
      n: this.api.gastos().filter((g) => g.categoria.toLowerCase() === c.nombre.toLowerCase()).length,
    })),
  );

  otras(c: FilaCategoria) {
    return this.api.categorias().filter((x) => x.id !== c.id);
  }

  private avisar(texto: string, error: boolean) {
    this.mensaje.set(texto);
    this.esError.set(error);
  }

  async crear() {
    const nombre = this.nombre.trim();
    if (!nombre) return this.avisar('Escribe el nombre de la categoría.', true);
    try {
      const c = await this.api.crearCategoria(nombre);
      this.nombre = '';
      this.avisar(`Categoría «${c.nombre}» creada.`, false);
    } catch (e) {
      this.avisar(mensajeError(e, 'No se pudo crear la categoría.'), true);
    }
  }

  quitar(c: FilaCategoria) {
    if (c.n === 0) {
      void this.ejecutar(c); // sin gastos: se quita de una vez
      return;
    }
    // con gastos: primero se elige a qué categoría moverlos (por defecto «Otros»)
    const otras = this.otras(c);
    this.destinoId = otras.find((o) => o.nombre === 'Otros')?.id ?? otras[0]?.id ?? null;
    this.quitando.set(this.quitando() === c.id ? null : c.id);
  }

  confirmar(c: FilaCategoria) {
    if (this.destinoId === null) return;
    void this.ejecutar(c, this.destinoId);
  }

  private async ejecutar(c: FilaCategoria, destinoId?: number) {
    try {
      const res = await this.api.quitarCategoria(c.id, destinoId);
      this.quitando.set(null);
      const movidos = res.movidos ? ` Se movieron ${res.movidos} ${res.movidos === 1 ? 'gasto' : 'gastos'}.` : '';
      this.avisar(`Categoría «${c.nombre}» quitada.${movidos}`, false);
    } catch (e) {
      this.avisar(mensajeError(e, 'No se pudo quitar la categoría.'), true);
    }
  }
}
