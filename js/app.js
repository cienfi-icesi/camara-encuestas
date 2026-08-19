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

  // Texto de modo a partir de la COMPOSICIÓN real de los veredictos (modo_modelo/modo_heuristico),
  // no de si la última corrida pasó --sin-modelo: una corrida heurística puede dejar intactos
  // veredictos del modelo de días anteriores (ver agente/estado.py:_degrada), así que basarse en
  // la bandera de la corrida decía "modo heurístico" sobre datos que en realidad sí lo tenían.
  function textoModo(modelo, nModelo, nHeur) {
    if (!nModelo && !nHeur) return 'sin evaluar';
    if (!nHeur) return `verificado con ${modelo}`;
    if (!nModelo) return 'modo heurístico (sin modelo)';
    return `${nModelo} verificadas con ${modelo}, ${nHeur} en heurística`;
  }

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
        const modo = textoModo(idx.modelo, idx.modo_modelo, idx.modo_heuristico);
        $('login-nota').textContent = `Datos de la corrida del ${fmtFecha(idx.fecha_corrida)} (${modo}). Se descargan cifrados y solo se abren en tu navegador.`;
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
      textoModo(r.modelo_verificador || DATOS.modelo, r.modo_modelo, r.modo_heuristico);
    const aviso = $('t-aviso');
    if (r.modo_heuristico > 0) {
      aviso.textContent = r.modo_modelo > 0
        ? `${r.modo_heuristico} de estas empresas todavía no las revisó el modelo (quedaron en heurística: reglas sobre cabeceras de correo y palabras clave). Sus estados son una aproximación.`
        : 'Esta corrida se hizo en modo heurístico (reglas sobre cabeceras de correo y palabras clave, sin el modelo). Los estados son una aproximación; la corrida con claude-sonnet-5 los afina.';
      aviso.classList.remove('oculto');
    } else aviso.classList.add('oculto');
    renderHero(r); renderBarra(r); renderEncuestas(r); renderHoy(); renderSeguimientos(); renderTabla();
  }

  // Hero: los dos números que importan. "Gestión efectiva" = avance real (la empresa
  // respondió con algo: aceptó, rechazó, o respondió sin decidir). Reemplaza las 6 tarjetas
  // que repetían la barra de estado de abajo.
  function renderHero(r) {
    const total = r.total || 1;
    const si = r.aceptaron || 0, resp = r.en_seguimiento || 0, no = r.rechazaron || 0;
    const efe = r.gestion_efectiva != null ? r.gestion_efectiva : si + resp + no;
    const w = (n) => (100 * n / total).toFixed(1);
    const e = r.encuestas;
    // Dos números distintos, sin mezclar: "diligenciadas" (la meta real) y, aparte, cuántas
    // de esas tienen los 4 módulos completos. Ver encuestas.resumen_persona.
    const dilig = e && (e.diligenciadas != null ? e.diligenciadas : e.completas);
    const colEnc = e && e.disponible
      ? `<div class="col enc">
           <div class="rot">Encuestas diligenciadas</div>
           <div class="big">${dilig}</div>
           <ul class="desglose" style="margin-top:12px">
             <li><b>${e.completas}</b> con los cuatro módulos completos${e.parciales_justificadas ? ` · <b>${e.parciales_justificadas}</b> parcial(es) con justificación` : ''}</li>
             <li><span style="color:var(--gris-oscuro)">${e.realizadas} realizadas · ${e.en_curso} aún en curso${e.autodiligenciadas ? ' · ' + e.autodiligenciadas + ' autodiligenciadas' : ''}</span></li>
           </ul>
         </div>`
      : '';
    $('t-hero').classList.toggle('hero', !!colEnc);   // sin 2ª columna, no forzar el grid
    $('t-hero').innerHTML = `
      <div class="col">
        <div class="rot">Gestión efectiva · avances reales</div>
        <div class="big">${efe} <span class="de">de ${total}</span></div>
        <div class="prog">
          <i style="width:${w(si)}%;background:${COLOR.contacto_efectivo_si}"></i>
          <i style="width:${w(resp)}%;background:${COLOR.respondio_sin_decision}"></i>
          <i style="width:${w(no)}%;background:${COLOR.contacto_efectivo_no}"></i>
        </div>
        <ul class="desglose">
          <li><span class="pt" style="background:${COLOR.contacto_efectivo_si}"></span> <b>${si}</b> aceptaron o agendaron</li>
          <li><span class="pt" style="background:${COLOR.respondio_sin_decision}"></span> <b>${resp}</b> respondieron, sin decidir aún <span style="color:var(--gris)">· seguimiento a 3–4 días</span></li>
          <li><span class="pt" style="background:${COLOR.contacto_efectivo_no}"></span> <b>${no}</b> no desea participar <span style="color:var(--gris)">· cerrada</span></li>
        </ul>
      </div>${colEnc}`;
  }

  function renderBarra(r) {
    const total = r.total || 1;
    $('t-barra').innerHTML = ESTADOS.map((s) => {
      const n = r.por_estado[s] || 0;
      return n ? `<span style="width:${(100 * n / total).toFixed(2)}%;background:${COLOR[s]}" title="${ETIQUETA[s]}: ${n}"></span>` : '';
    }).join('');
    $('t-leyenda').innerHTML = ESTADOS.map((s) => `<span><i style="background:${COLOR[s]}"></i>${ETIQUETA[s]}: <b>${r.por_estado[s] || 0}</b> (${(100 * (r.por_estado[s] || 0) / total).toFixed(0)}%)</span>`).join('');
  }

  // ------------------------------------------------------- encuestas (SVG plano, sin librerías)
  const C_COMPLETA = '#147A3D', C_CURSO = '#8A6D1F', C_AUTO = '#395CE0', C_TENUE = '#D7D8DC';

  /* Panel de encuestas. Sustituye al viejo "Declarado vs. verificado": lo que importa no es
   * cuántas casillas se marcaron en el Excel, sino cuántas empresas efectivamente contestaron.
   * Se adapta a quién mira: coordinación ve la comparación entre encuestadores; cada
   * encuestador ve su propio embudo, de empresas asignadas a encuestas completas. */
  function renderEncuestas(r) {
    const cont = $('t-encuestas');
    const meta = DATOS.encuestas_meta;
    if (!r.encuestas || !r.encuestas.disponible) {
      $('t-enc-ayuda').textContent = 'Del contacto a la encuesta contestada.';
      cont.innerHTML = '<p class="ayuda" style="margin:6px 0 0">Todavía no hay datos de encuestas contestadas ' +
        '(falta el export de <code>reporte_3i</code>).</p>';
      return;
    }
    let nota = '';
    if (meta && meta.dias_desactualizado != null && meta.dias_desactualizado > 10) {
      nota = `<p class="ayuda" style="color:#8A6D1F;margin:10px 0 0"><b>Ojo:</b> el archivo de encuestas ` +
             `se actualizó por última vez el ${fmtFecha(meta.actualizado)} (${meta.dias_desactualizado} días); ` +
             `puede haber encuestas nuevas que no se ven aquí.</p>`;
    }
    cont.innerHTML = (PERSONA === 'TODAS' ? svgEquipo() : svgEmbudo(r)) + nota;
  }

  // Coordinación: cuántas encuestas lleva cada quien. La barra separa diligenciadas (hechas)
  // de en curso; debajo se aclara cuántas de las diligenciadas tienen los 4 módulos.
  function svgEquipo() {
    const personas = (DATOS.personas || Object.keys(DATOS.resumen).filter((k) => k !== 'TOTAL'));
    const filas = personas.map((p) => {
      const e = (DATOS.resumen[p] || {}).encuestas || {};
      const dilig = e.diligenciadas != null ? e.diligenciadas : (e.completas || 0);
      return { nombre: NOMBRE_PERSONA[p] || p, realizadas: e.realizadas || 0, diligenciadas: dilig,
               completas: e.completas || 0, en_curso: e.en_curso != null ? e.en_curso : (e.realizadas || 0) - dilig,
               autodiligenciadas: e.autodiligenciadas || 0 };
    });
    const max = Math.max(1, ...filas.map((f) => f.realizadas));
    const W = 560, alto = 42, izq = 92, anchoMax = W - izq - 70;
    let y = 6;
    let svg = `<svg class="svg-grafico" viewBox="0 0 ${W} ${filas.length * alto + 34}" role="img" aria-label="Encuestas por encuestador">`;
    filas.forEach((f) => {
      const wC = Math.max(f.diligenciadas ? 2 : 0, anchoMax * f.diligenciadas / max);
      const wE = Math.max(f.en_curso ? 2 : 0, anchoMax * f.en_curso / max);
      svg += `<text x="${izq - 8}" y="${y + 20}" text-anchor="end" font-size="13" fill="#26272B">${esc(f.nombre)}</text>` +
             `<rect x="${izq}" y="${y + 7}" width="${wC}" height="18" rx="3" fill="${C_COMPLETA}"><title>Diligenciadas: ${f.diligenciadas}</title></rect>` +
             `<rect x="${izq + wC}" y="${y + 7}" width="${wE}" height="18" rx="3" fill="${C_CURSO}"><title>En curso: ${f.en_curso}</title></rect>` +
             `<text x="${izq + wC + wE + 8}" y="${y + 21}" font-size="13" font-weight="700" fill="#0B0B0C">${f.realizadas}</text>` +
             `<text x="${izq}" y="${y + 38}" font-size="11.5" fill="#5A5C61">${f.diligenciadas} diligenciadas (${f.completas} con los 4 módulos) · ${f.en_curso} en curso` +
             (f.autodiligenciadas ? ` · ${f.autodiligenciadas} autodiligenciadas` : '') + `</text>`;
      y += alto;
    });
    svg += `<rect x="${izq}" y="${y + 4}" width="10" height="10" rx="2" fill="${C_COMPLETA}"></rect>` +
           `<text x="${izq + 15}" y="${y + 13}" font-size="11.5" fill="#5A5C61">Diligenciada</text>` +
           `<rect x="${izq + 100}" y="${y + 4}" width="10" height="10" rx="2" fill="${C_CURSO}"></rect>` +
           `<text x="${izq + 115}" y="${y + 13}" font-size="11.5" fill="#5A5C61">En curso</text></svg>`;
    return svg;
  }

  // Encuestador: el embudo real, de la cartera asignada a la encuesta diligenciada.
  function svgEmbudo(r) {
    const e = r.encuestas;
    const dilig = e.diligenciadas != null ? e.diligenciadas : e.completas;
    const pasos = [
      { t: 'Empresas asignadas', v: r.total, c: C_TENUE, oscuro: true },
      { t: 'Gestión efectiva', v: r.gestion_efectiva != null ? r.gestion_efectiva : r.contactadas_efectivamente, c: '#7A93F0' },
      { t: 'Encuestas iniciadas', v: e.realizadas, c: C_CURSO },
      { t: 'Encuestas diligenciadas', v: dilig, c: C_COMPLETA },
    ];
    const max = Math.max(1, r.total);
    const W = 560, alto = 38, izq = 210, anchoMax = W - izq - 60;
    let y = 4;
    let svg = `<svg class="svg-grafico" viewBox="0 0 ${W} ${pasos.length * alto + 30}" role="img" aria-label="Embudo hasta la encuesta">`;
    pasos.forEach((p) => {
      const w = Math.max(2, anchoMax * p.v / max);
      svg += `<text x="${izq - 8}" y="${y + 22}" text-anchor="end" font-size="12.5" fill="#26272B">${esc(p.t)}</text>` +
             `<rect x="${izq}" y="${y + 8}" width="${w}" height="18" rx="3" fill="${p.c}"></rect>` +
             `<text x="${izq + w + 7}" y="${y + 22}" font-size="13" font-weight="700" fill="${p.oscuro ? '#5A5C61' : '#0B0B0C'}">${p.v}</text>`;
      y += alto;
    });
    svg += `<text x="${izq}" y="${y + 16}" font-size="11.5" fill="#5A5C61">` +
           `De tus ${e.realizadas} encuestas: ${e.aplicadas_por_el} la aplicaste tú` +
           (e.autodiligenciadas ? ` y ${e.autodiligenciadas} las diligenció la empresa sola` : '') + `.</text></svg>`;
    return svg;
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
      return fila + `<tr class="detalle"><td colspan="7"><div class="detalle-grid">
        <div style="grid-column:1/-1"><b>Resumen:</b> ${esc(v.resumen || '—')}</div>
        <div style="grid-column:1/-1"><b>Siguiente paso:</b> ${esc(v.siguiente_paso || '—')}</div>
        <div><b>Respuesta:</b> ${v.hubo_respuesta_empresa ? 'sí (' + esc(v.tipo_respuesta) + ')' : 'no'} · ${v.n_intentos_evidenciados || 0} intentos${(v.canales_evidenciados || []).length ? ' · ' + esc(v.canales_evidenciados.join(', ')) : ''}</div>
        <div><b>Última respuesta:</b> ${fmtFecha(v.fecha_ultima_respuesta)}${v.fecha_sugerida_seguimiento || (e.prioridad || {}).fecha_recordatorio ? ` · <b>recordar:</b> ${fmtFecha(v.fecha_sugerida_seguimiento || (e.prioridad || {}).fecha_recordatorio)}` : ''}</div>
        ${v.ajuste_contacto_prop ? `<div style="grid-column:1/-1;color:#5A5C61"><b>Contacto proporcionado:</b> la empresa entregó un contacto${v.ajuste_contacto_prop.contacto ? ` (${esc(v.ajuste_contacto_prop.contacto)})` : ''}, así que se cuenta como avance. Por evidencia documental el agente lo veía como <i>${esc(ETIQUETA[v.ajuste_contacto_prop.estado_agente] || v.ajuste_contacto_prop.estado_agente)}</i>.</div>` : ''}
        ${(e.declarado.casillas || []).length || e.declarado.no_participa ? `<div style="grid-column:1/-1"><b>Casillas del Excel:</b> ${esc((e.declarado.casillas || []).join(', ') || '—')}${e.declarado.no_participa ? ' · en hoja no-participa' : ''}</div>` : ''}
        ${v.coincide_con_declarado === false ? `<div style="grid-column:1/-1"><span class="discrepancia"><b>Discrepancia:</b> ${esc(v.discrepancia || 'el declarado no coincide con la evidencia')}</span></div>` : ''}
        ${e.override ? `<div style="grid-column:1/-1"><b>Override:</b> ${esc(e.override.estado_verificado || '')} ${esc(e.override.nota || '')} (${esc(e.override.autor || '')}, ${esc(e.override.fecha || '')})</div>` : ''}
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
