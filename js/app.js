/* Tablero de seguimiento · Proyecto 3i — lógica de presentación (JS plano, sin dependencias).
 * Consume el objeto descifrado por auth.js:
 *   { fecha_corrida, generado_en, modo, modelo, rol, persona?, resumen{persona:{...}}, prioridades{persona:{...}}, empresas[...] }
 */
(function () {
  'use strict';

  const ESTADOS = ['contacto_efectivo_si', 'contacto_efectivo_no', 'respondio_sin_decision', 'intento_sin_respuesta', 'solo_correo', 'sin_gestion'];
  const ETIQUETA = {
    contacto_efectivo_si: 'Aceptó / agendó', contacto_efectivo_no: 'No desea participar',
    respondio_sin_decision: 'Respondió, sin decisión', intento_sin_respuesta: 'Intentos sin respuesta',
    solo_correo: 'Solo correo enviado', sin_gestion: 'Sin gestión'
  };
  const COLOR = {
    contacto_efectivo_si: '#147A3D', contacto_efectivo_no: '#5A5C61', respondio_sin_decision: '#395CE0',
    intento_sin_respuesta: '#8A6D1F', solo_correo: '#C0562F', sin_gestion: '#B3261E'
  };
  const NOMBRE_PERSONA = { Diana: 'Diana', Leonardo: 'Leonardo', Angela: 'Ángela' };
  const POR_PAGINA = 50;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtFecha = (iso) => {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${parseInt(m[3], 10)} ${meses[parseInt(m[2], 10) - 1]} ${m[1]}`;
  };

  let DATOS = null;          // objeto descifrado
  let PERSONA = null;        // persona activa (o 'TODAS' para admin)
  let filtro = { texto: '', estado: '', declarado: '', discrep: '' };
  let orden = { col: 'estado', asc: true };
  let pagina = 1;
  let abierta = null;        // id de la fila expandida

  // ------------------------------------------------------------------ login
  async function inicio() {
    try {
      const idx = await Auth.cargarIndice();
      if (idx && idx.fecha_corrida) {
        $('login-nota').textContent = `Datos de la corrida del ${fmtFecha(idx.fecha_corrida)} (${idx.modo === 'modelo' ? 'verificados con ' + idx.modelo : 'modo heurístico, sin modelo'}). Se descargan cifrados y solo se abren en tu navegador.`;
      }
    } catch (e) { /* el índice es opcional para el login */ }
    $('form-login').addEventListener('submit', entrar);
    $('btn-salir').addEventListener('click', salir);
    $('f-buscar').addEventListener('input', (e) => { filtro.texto = e.target.value.trim().toLowerCase(); pagina = 1; renderTabla(); });
    $('f-estado').addEventListener('change', (e) => { filtro.estado = e.target.value; pagina = 1; renderTabla(); });
    $('f-declarado').addEventListener('change', (e) => { filtro.declarado = e.target.value; pagina = 1; renderTabla(); });
    $('f-discrep').addEventListener('change', (e) => { filtro.discrep = e.target.value; pagina = 1; renderTabla(); });
    document.querySelectorAll('#t-tabla th').forEach((th) => th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (orden.col === col) orden.asc = !orden.asc; else { orden.col = col; orden.asc = true; }
      renderTabla();
    }));
    const sel = $('f-estado');
    ESTADOS.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = ETIQUETA[s]; sel.appendChild(o); });
  }

  async function entrar(ev) {
    ev.preventDefault();
    const btn = $('btn-entrar'); const err = $('login-error');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Abriendo…';
    try {
      DATOS = await Auth.abrir($('usuario').value, $('clave').value);
      $('clave').value = '';
      mostrarTablero();
    } catch (e) {
      err.textContent = e.message === 'credenciales' ? 'Usuario o contraseña incorrectos.' : ('No se pudo abrir el tablero: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  }

  function salir() {
    DATOS = null; PERSONA = null; abierta = null;
    $('vista-tablero').classList.add('oculto'); $('sesion').classList.add('oculto');
    $('vista-login').classList.remove('oculto');
    $('usuario').focus();
  }

  // ---------------------------------------------------------------- tablero
  function personasDisponibles() {
    if (DATOS.rol === 'admin') return (DATOS.personas || Object.keys(DATOS.resumen).filter((k) => k !== 'TOTAL'));
    return [DATOS.persona];
  }

  function mostrarTablero() {
    $('vista-login').classList.add('oculto');
    $('vista-tablero').classList.remove('oculto');
    $('sesion').classList.remove('oculto');
    $('sesion-nombre').textContent = DATOS.rol === 'admin' ? 'Coordinación (admin)' : (DATOS.nombre || DATOS.usuario || '');
    const personas = personasDisponibles();
    PERSONA = DATOS.rol === 'admin' ? 'TODAS' : personas[0];
    const tabs = $('t-tabs'); tabs.innerHTML = '';
    if (DATOS.rol === 'admin') {
      ['TODAS'].concat(personas).forEach((p) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (p === PERSONA ? ' activa' : '');
        b.textContent = p === 'TODAS' ? 'Todo el equipo' : NOMBRE_PERSONA[p] || p;
        b.addEventListener('click', () => { PERSONA = p; pagina = 1; abierta = null; tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('activa')); b.classList.add('activa'); render(); });
        tabs.appendChild(b);
      });
    }
    render();
    window.scrollTo(0, 0);
  }

  function empresasActivas() {
    return PERSONA === 'TODAS' ? DATOS.empresas : DATOS.empresas.filter((e) => e.persona === PERSONA);
  }
  function resumenActivo() {
    return PERSONA === 'TODAS' ? DATOS.resumen.TOTAL : DATOS.resumen[PERSONA];
  }

  function render() {
    const r = resumenActivo();
    const quien = PERSONA === 'TODAS' ? 'Todo el equipo' : (NOMBRE_PERSONA[PERSONA] || PERSONA);
    $('t-titulo').textContent = `Tablero de ${quien}`;
    $('t-meta').textContent = `Corrida del ${fmtFecha(DATOS.fecha_corrida)} · ${r.total} empresas asignadas · ` +
      (DATOS.modo === 'modelo' ? `verificado con ${DATOS.modelo}` : 'modo heurístico (sin modelo)');
    const aviso = $('t-aviso');
    if (DATOS.modo !== 'modelo') {
      aviso.textContent = 'Esta corrida se hizo en modo heurístico (reglas sobre cabeceras de correo y palabras clave, sin el modelo). Los estados son una aproximación; la corrida con claude-sonnet-5 los afina.';
      aviso.classList.remove('oculto');
    } else aviso.classList.add('oculto');
    renderKpis(r); renderBarra(r); renderComparacion(r); renderHoy(); renderSeguimientos(); renderTabla();
  }

  function renderKpis(r) {
    const k = [
      { c: 'si', v: r.contactadas_efectivamente, e: 'Contactadas efectivamente', d: `${r.aceptaron} sí · ${r.rechazaron} no` },
      { c: 'faltan', v: r.faltan_por_contactar, e: 'Faltan por contactar realmente', d: `de ${r.total} asignadas` },
      { c: 'resp', v: r.en_seguimiento, e: 'Respondieron sin decisión', d: 'seguimiento a 3–4 días' },
      { c: 'int', v: r.intento_sin_respuesta, e: 'Intentos sin respuesta', d: 'llamadas / WhatsApp sin eco' },
      { c: 'correo', v: r.solo_correo, e: 'Solo un correo enviado', d: 'no cuenta como contactada' },
      { c: 'sin', v: r.sin_gestion, e: 'Sin gestión', d: 'carpeta sin evidencia' },
    ];
    $('t-kpis').innerHTML = k.map((x) => `<div class="kpi ${x.c}"><div class="valor">${x.v}</div><div class="etiqueta">${x.e}</div><div class="detalle">${x.d}</div></div>`).join('');
  }

  function renderBarra(r) {
    const total = r.total || 1;
    $('t-barra').innerHTML = ESTADOS.map((s) => {
      const n = r.por_estado[s] || 0;
      return n ? `<span style="width:${(100 * n / total).toFixed(2)}%;background:${COLOR[s]}" title="${ETIQUETA[s]}: ${n}"></span>` : '';
    }).join('');
    $('t-leyenda').innerHTML = ESTADOS.map((s) => `<span><i style="background:${COLOR[s]}"></i>${ETIQUETA[s]}: <b>${r.por_estado[s] || 0}</b> (${(100 * (r.por_estado[s] || 0) / total).toFixed(0)}%)</span>`).join('');
  }

  // Barras horizontales SVG (sin librerías, como en SICMON)
  function renderComparacion(r) {
    const filas = [
      { e: 'Declaradas "efectivo" en el Excel', v: r.declarado_efectivo, c: '#7A93F0' },
      { e: 'Contacto efectivo verificado (sí + no)', v: r.contactadas_efectivamente, c: '#147A3D' },
      { e: 'Respondieron sin decisión', v: r.en_seguimiento, c: '#395CE0' },
      { e: 'Discrepancias (declarado ≠ evidencia)', v: r.discrepancias_con_declarado, c: '#B3261E' },
    ];
    const max = Math.max(1, ...filas.map((f) => f.v), r.total * 0.0 + 1);
    const W = 560, alto = 30, izq = 250;
    let y = 4;
    let svg = `<svg class="svg-grafico" viewBox="0 0 ${W} ${filas.length * alto + 8}" role="img" aria-label="Declarado frente a verificado">`;
    filas.forEach((f) => {
      const w = Math.max(2, (W - izq - 60) * f.v / max);
      svg += `<text x="${izq - 8}" y="${y + 18}" text-anchor="end" font-size="12.5" fill="#26272B">${esc(f.e)}</text>` +
             `<rect x="${izq}" y="${y + 6}" width="${w}" height="16" rx="3" fill="${f.c}"></rect>` +
             `<text x="${izq + w + 6}" y="${y + 18}" font-size="12.5" font-weight="700" fill="#0B0B0C">${f.v}</text>`;
      y += alto;
    });
    svg += '</svg>';
    $('t-comparacion').innerHTML = svg;
  }

  function prioridadesActivas() {
    if (PERSONA !== 'TODAS') return DATOS.prioridades[PERSONA] || { hoy: [], seguimientos: [] };
    const hoy = [], seg = [];
    personasDisponibles().forEach((p) => {
      const b = DATOS.prioridades[p]; if (!b) return;
      (b.hoy || []).forEach((x) => hoy.push(Object.assign({ persona: p }, x)));
      (b.seguimientos || []).forEach((x) => seg.push(Object.assign({ persona: p }, x)));
    });
    return { hoy, seguimientos: seg, fecha: DATOS.fecha_corrida };
  }

  function renderHoy() {
    const p = prioridadesActivas();
    $('t-hoy-titulo').textContent = `Hoy: ${p.hoy.length} empresas a intentar contactar`;
    $('t-hoy-ayuda').textContent = 'Si dejas evidencia del intento en la carpeta de la empresa (relatoría del día), mañana salen otras; si no, se repiten. Puedes añadir 2 más por tu cuenta.';
    if (!p.hoy.length) { $('t-hoy').innerHTML = '<li class="vacio">Sin empresas priorizadas.</li>'; return; }
    $('t-hoy').innerHTML = p.hoy.map((x, i) => `<li>
      <span class="num ${x.motivo === 'arrastrada' ? 'arrastrada' : ''}" title="${x.motivo === 'arrastrada' ? 'Vuelve a salir: ayer no quedó evidencia' : 'Nueva'}">${i + 1}</span>
      <div><div class="empresa">${esc(x.empresa)} <span style="color:#88898C;font-weight:400">· id ${x.id}${x.persona ? ' · ' + (NOMBRE_PERSONA[x.persona] || x.persona) : ''}</span></div>
      <div class="sub"><span class="chip ${x.estado}">${ETIQUETA[x.estado] || x.estado}</span>${x.motivo === 'arrastrada' ? ' · vuelve a salir (sin evidencia de intento)' : ''}${x.veces_priorizada > 1 ? ' · en lista ' + x.veces_priorizada + ' veces' : ''}</div>
      <div class="paso">${esc(x.siguiente_paso || '')}</div></div></li>`).join('');
  }

  function renderSeguimientos() {
    const p = prioridadesActivas();
    if (!p.seguimientos.length) { $('t-seguimientos').innerHTML = '<li class="vacio">Nada vence hoy.</li>'; return; }
    $('t-seguimientos').innerHTML = p.seguimientos.map((s) => `<li>
      <span class="num">↺</span>
      <div><div class="empresa">${esc(s.empresa)} <span style="color:#88898C;font-weight:400">· id ${s.id}${s.persona ? ' · ' + (NOMBRE_PERSONA[s.persona] || s.persona) : ''}</span></div>
      <div class="sub">vence ${fmtFecha(s.fecha_recordatorio)}${s.dias_vencido > 0 ? ' · hace ' + s.dias_vencido + ' día(s)' : ' · hoy'}</div>
      <div class="paso">${esc(s.siguiente_paso || s.resumen || '')}</div></div></li>`).join('');
  }

  // ------------------------------------------------------------------ tabla
  function filasFiltradas() {
    let f = empresasActivas();
    if (filtro.texto) f = f.filter((e) => (e.empresa || '').toLowerCase().includes(filtro.texto) || e.id.includes(filtro.texto));
    if (filtro.estado) f = f.filter((e) => e.verificado.estado_verificado === filtro.estado);
    if (filtro.declarado) f = f.filter((e) => (e.declarado.contacto || 'sin_registro') === filtro.declarado);
    if (filtro.discrep) f = f.filter((e) => e.verificado.coincide_con_declarado === false);
    const clave = {
      id: (e) => e.id, empresa: (e) => (e.empresa || '').toLowerCase(),
      estado: (e) => ESTADOS.indexOf(e.verificado.estado_verificado),
      declarado: (e) => e.declarado.contacto || 'zz', ultima: (e) => e.verificado.fecha_ultima_gestion || '',
      n_archivos: (e) => e.evidencia.n_archivos || 0, confianza: (e) => e.verificado.confianza || 0,
    }[orden.col] || ((e) => e.id);
    f = f.slice().sort((a, b) => { const x = clave(a), y = clave(b); return (x < y ? -1 : x > y ? 1 : 0) * (orden.asc ? 1 : -1); });
    return f;
  }

  function renderTabla() {
    const f = filasFiltradas();
    const paginas = Math.max(1, Math.ceil(f.length / POR_PAGINA));
    if (pagina > paginas) pagina = paginas;
    const desde = (pagina - 1) * POR_PAGINA;
    const cuerpo = $('t-cuerpo');
    cuerpo.innerHTML = f.slice(desde, desde + POR_PAGINA).map((e) => {
      const v = e.verificado;
      const fila = `<tr class="fila" data-id="${e.id}">
        <td class="mono">${e.id}</td>
        <td><b>${esc(e.empresa)}</b>${PERSONA === 'TODAS' ? `<div style="font-size:12px;color:#88898C">${NOMBRE_PERSONA[e.persona] || e.persona}</div>` : ''}${e.override ? ' <span class="chip gris" title="corregido a mano">override</span>' : ''}</td>
        <td><span class="chip ${v.estado_verificado}">${ETIQUETA[v.estado_verificado] || v.estado_verificado}</span></td>
        <td>${esc(e.declarado.contacto || '—')}${e.declarado.n_llamadas != null ? ` <span style="color:#88898C">· ${e.declarado.n_llamadas} llam.</span>` : ''}${v.coincide_con_declarado === false ? ' <span class="discrepancia" title="declarado ≠ evidencia">≠</span>' : ''}</td>
        <td>${fmtFecha(v.fecha_ultima_gestion)}</td>
        <td>${e.evidencia.n_archivos}${e.evidencia.n_relatorias ? ` <span style="color:#88898C">(${e.evidencia.n_relatorias} relat.)</span>` : ''}</td>
        <td>${v.confianza != null ? Math.round(v.confianza * 100) + '%' : '—'}</td></tr>`;
      if (abierta !== e.id) return fila;
      const arch = (e.evidencia.archivos || []).map((a) => `${esc(a.archivo)}`).join(', ');
      const cons = e.declarado.consolidado ? Object.entries(e.declarado.consolidado).filter(([, x]) => x).map(([k, x]) => `${k}: ${esc(x)}`).join(' · ') : '—';
      return fila + `<tr class="detalle"><td colspan="7"><div class="detalle-grid">
        <div><b>Resumen del agente:</b> ${esc(v.resumen || '—')}</div>
        <div><b>Siguiente paso:</b> ${esc(v.siguiente_paso || '—')}</div>
        <div><b>Respuesta de la empresa:</b> ${v.hubo_respuesta_empresa ? 'sí (' + esc(v.tipo_respuesta) + ')' : 'no'} · <b>Canales:</b> ${esc((v.canales_evidenciados || []).join(', ') || '—')} · <b>Intentos:</b> ${v.n_intentos_evidenciados || 0}</div>
        <div><b>Última respuesta:</b> ${fmtFecha(v.fecha_ultima_respuesta)} · <b>Recordatorio:</b> ${fmtFecha(v.fecha_sugerida_seguimiento || (e.prioridad || {}).fecha_recordatorio)}</div>
        <div>${v.coincide_con_declarado === false ? `<span class="discrepancia"><b>Discrepancia:</b> ${esc(v.discrepancia || 'el declarado no coincide con la evidencia')}</span>` : '<b>Coincide con lo declarado.</b>'}</div>
        <div><b>Casillas del Excel:</b> ${esc((e.declarado.casillas || []).join(', ') || '—')}${e.declarado.no_participa ? ' · en hoja no-participa' : ''}</div>
        <div><b>Consolidado del equipo:</b> ${cons}</div>
        <div><b>Archivos clave:</b> ${esc((v.archivos_clave || []).join(', ') || '—')}</div>
        <div style="grid-column:1/-1"><b>Evidencia (${e.evidencia.n_archivos}):</b> ${arch || '—'}</div>
        <div><b>Modo:</b> ${esc(v.modo)}${v.modelo ? ' · ' + esc(v.modelo) : ''} · evaluada el ${fmtFecha(v.actualizado_en)}${v.heuristica ? ' · heurística: ' + esc(ETIQUETA[v.heuristica.estado_verificado] || v.heuristica.estado_verificado) : ''}</div>
        ${e.override ? `<div><b>Override:</b> ${esc(e.override.estado_verificado || '')} ${esc(e.override.nota || '')} (${esc(e.override.autor || '')}, ${esc(e.override.fecha || '')})</div>` : ''}
        ${v.error ? `<div class="discrepancia" style="grid-column:1/-1"><b>Error:</b> ${esc(v.error)}</div>` : ''}
      </div></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vacio">Sin resultados para el filtro.</td></tr>';
    cuerpo.querySelectorAll('tr.fila').forEach((tr) => tr.addEventListener('click', () => { abierta = abierta === tr.dataset.id ? null : tr.dataset.id; renderTabla(); }));
    $('t-pag').innerHTML = `${f.length} empresas · página ${pagina} de ${paginas} ` +
      `<button class="boton secundario chico" ${pagina <= 1 ? 'disabled' : ''} id="pag-ant" type="button">‹</button>` +
      `<button class="boton secundario chico" ${pagina >= paginas ? 'disabled' : ''} id="pag-sig" type="button">›</button>`;
    const ant = $('pag-ant'), sig = $('pag-sig');
    if (ant) ant.addEventListener('click', () => { pagina--; renderTabla(); });
    if (sig) sig.addEventListener('click', () => { pagina++; renderTabla(); });
  }

  document.addEventListener('DOMContentLoaded', inicio);
})();
