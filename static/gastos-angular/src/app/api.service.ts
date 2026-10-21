import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Gasto {
  id: number;
  fecha: string;
  concepto: string;
  monto: number;
  categoria: string;
  descripcion: string | null;
  banco_id: number | null;
  banco: string | null;
}
export interface Banco { id: number; nombre: string }
export interface Categoria { id: number; nombre: string; protegida: boolean }
export interface NuevoGasto {
  fecha: string;
  concepto: string;
  monto: number;
  categoria: string;
  banco_id: number;
  descripcion: string;
}

export const CATEGORIA_RETIROS = 'Retiros y avances';

export function mensajeError(e: unknown, porDefecto: string): string {
  if (e instanceof HttpErrorResponse) {
    const m = (e.error as { error?: unknown } | null)?.error;
    if (typeof m === 'string') return m;
    if (e.status === 0) return 'No hay conexión con el servidor. ¿Está corriendo python app.py?';
  }
  return porDefecto;
}

/** Habla con la API de Flask y guarda el estado compartido por todas las secciones. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  readonly gastos = signal<Gasto[]>([]);
  readonly bancos = signal<Banco[]>([]);
  readonly categorias = signal<Categoria[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal('');
  readonly pendientes = computed(() => this.gastos().filter((g) => g.banco_id == null).length);

  constructor() {
    void this.cargarTodo();
  }

  async cargarTodo(): Promise<void> {
    try {
      const [gastos, bancos, categorias] = await Promise.all([
        firstValueFrom(this.http.get<Gasto[]>('/api/gastos')),
        firstValueFrom(this.http.get<Banco[]>('/api/bancos')),
        firstValueFrom(this.http.get<Categoria[]>('/api/categorias')),
      ]);
      this.gastos.set(gastos);
      this.bancos.set(bancos);
      this.categorias.set(categorias);
      this.errorCarga.set('');
    } catch (e) {
      this.errorCarga.set(mensajeError(e, 'No se pudieron cargar los datos. Reinicia el servidor con el app.py más reciente.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargarGastos() {
    this.gastos.set(await firstValueFrom(this.http.get<Gasto[]>('/api/gastos')));
  }
  private async recargarBancos() {
    this.bancos.set(await firstValueFrom(this.http.get<Banco[]>('/api/bancos')));
  }
  private async recargarCategorias() {
    this.categorias.set(await firstValueFrom(this.http.get<Categoria[]>('/api/categorias')));
  }

  async crearGasto(gasto: NuevoGasto) {
    await firstValueFrom(this.http.post('/api/gastos', gasto));
    await this.recargarGastos();
  }
  async eliminarGasto(id: number) {
    await firstValueFrom(this.http.delete(`/api/gastos/${id}`));
    await this.recargarGastos();
  }
  async actualizarGasto(id: number, cambios: { categoria?: string; descripcion?: string }) {
    await firstValueFrom(this.http.patch(`/api/gastos/${id}`, cambios));
    await this.recargarGastos();
  }
  async asignarPendientes(bancoId: number) {
    await firstValueFrom(this.http.post('/api/gastos/asignar-banco', { banco_id: bancoId }));
    await this.recargarGastos();
  }

  async crearBanco(nombre: string) {
    const banco = await firstValueFrom(this.http.post<Banco>('/api/bancos', { nombre }));
    await this.recargarBancos();
    return banco;
  }

  async crearCategoria(nombre: string) {
    const categoria = await firstValueFrom(this.http.post<Categoria>('/api/categorias', { nombre }));
    await this.recargarCategorias();
    return categoria;
  }
  async quitarCategoria(id: number, destinoId?: number) {
    const params: Record<string, string | number> = destinoId ? { reasignar: destinoId } : {};
    const res = await firstValueFrom(this.http.delete<{ movidos: number }>(`/api/categorias/${id}`, { params }));
    await this.recargarCategorias();
    await this.recargarGastos();
    return res;
  }
}
