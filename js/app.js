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

  // CATEGORÍAS DE DISPLAY — agrupación pedida por Eduard (2026-08-19) para hacer más claro el
  // estado de cada empresa. NO cambia la taxonomía interna que produce el modelo (esa sigue con
  // los 6 ESTADOS), solo cómo se presenta en el tablero. Ventaja: no hay que reprocesar nada,
  // se calcula al vuelo desde el estado + `cerrada_por_encuesta`.
  //   encuesta_diligenciada  ← contacto_efectivo_si con encuesta hecha (verde oscuro)
  //   agendada               ← contacto_efectivo_si sin encuesta aún (verde)
  //   respondio_sin_decision ← respondio_sin_decision (azul)
  //   no_participa           ← contacto_efectivo_no (gris)
  //   intento                ← intento_sin_respuesta + solo_correo (naranja, unificado)
  //   sin_gestion            ← sin_gestion (rojo)
  // Los positivos se subdividen (pedido Eduard, 2026-08-19): "aceptó" no es igual a
  // "agendó" ni a "está diligenciando". El sub-estado sale de `verificado.sub_estado_efectivo`
  // (poblado por el modelo, ver prompt corroborar_sistema.md).
  const CATEGORIAS = ['encuesta_diligenciada', 'diligenciando', 'agendada', 'aceptada',
                      'respondio_sin_decision', 'no_participa', 'intento', 'sin_gestion'];
  const ETIQUETA_CAT = {
    encuesta_diligenciada: 'Encuesta diligenciada', diligenciando: 'Diligenciando encuesta',
    agendada: 'Entrevista agendada', aceptada: 'Aceptó, sin agenda',
    respondio_sin_decision: 'Respondió, sin decisión', no_participa: 'No desea participar',
    intento: 'Intentos (correo o llamada)', sin_gestion: 'Sin gestión'
  };
  // Paleta de 8 colores distintos por hue (pedido de Eduard, 2026-08-20: "no quiero que se
  // repitan colores"). Antes las cuatro categorías positivas eran cuatro tonos de verde muy
  // parecidos entre sí. Ahora cada categoría vive en un hue propio:
  //   verde bosque / teal / morado / mostaza / azul / gris / naranja / rojo.
  const COLOR_CAT = {
    encuesta_diligenciada: '#0F5C2E',   // verde bosque (mayor logro)
    diligenciando: '#0E9384',            // teal
    agendada: '#6B46C1',                 // morado
    aceptada: '#A16207',                 // mostaza / oro oscuro
    respondio_sin_decision: '#395CE0',   // azul (existente)
    no_participa: '#5A5C61',             // gris (existente)
    intento: '#C0562F',                  // naranja (existente)
    sin_gestion: '#B3261E'               // rojo (existente)
  };
  function categoria(e) {
    const v = e.verificado;
    const s = v.estado_verificado;
    if (s === 'contacto_efectivo_si') {
      if (e.cerrada_por_encuesta) return 'encuesta_diligenciada';
      const sub = v.sub_estado_efectivo;
      if (sub === 'diligenciando') return 'diligenciando';
      if (sub === 'agendado') return 'agendada';
      if (sub === 'aceptado') return 'aceptada';
      // Fallback (veredicto viejo sin sub_estado): agrupar como "agendada" — que era el
      // comportamiento anterior. Se corrige la próxima vez que el modelo revise la empresa.
      return 'agendada';
    }
    if (s === 'contacto_efectivo_no') return 'no_participa';
    if (s === 'respondio_sin_decision') return 'respondio_sin_decision';
    if (s === 'intento_sin_respuesta' || s === 'solo_correo') return 'intento';
    return 'sin_gestion';
  }
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

  // Secciones del tablero. Cada una es una vista independiente sobre los mismos datos;
  // antes todo vivía en una sola página larguísima y el trabajo del día quedaba enterrado
  // bajo la tabla de 690 empresas.
  const SECCIONES = [
    { k: 'resumen', t: 'Resumen' },
    { k: 'gestion', t: 'Gestión diaria' },
    { k: 'agenda', t: 'Agenda de la semana' },
    { k: 'auto', t: 'Diligenciamiento autónomo' },
    { k: 'comparacion', t: 'Comparación', soloAdmin: true },
    { k: 'bitacora', t: 'Bitácora' },
  ];

  let DATOS = null;          // objeto descifrado
  let SECCION = 'resumen';   // sección visible
  let FESTIVOS = new Set();  // festivos colombianos, para saber cuál fue el último día hábil
  let PERSONA = null;        // persona activa (o 'TODAS' para admin)
  let SEMANA = null;         // corte de Comparación: lunes ISO, 'todo' = acumulado, null = sin resolver
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const esHabil = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !FESTIVOS.has(iso(d));
  // Último día hábil a fecha de HOY (no de cuando se generó el archivo): es lo que permite
  // detectar que el tablero se quedó atrás, que es justo lo que nadie notó en agosto de 2026.
  function ultimoHabil(desde) {
    const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    while (!esHabil(d)) d.setDate(d.getDate() - 1);
    return d;
  }
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function fmtDiaFecha(isoStr) {
    if (!isoStr) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoStr);
    if (!m) return isoStr;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return `${DIAS_SEM[d.getDay()]} ${fmtFecha(isoStr)}`;
  }
  const fmtHora = (h) => (h ? h : '—');

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
    CATEGORIAS.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = ETIQUETA_CAT[k]; sel.appendChild(o); });
  }

  // GitHub Pages cachea index.html ~10 minutos. Los ?v= de css/js llevan el hash del archivo,
  // pero si el navegador sirve un index.html viejo pide el app.js viejo, y ese código leyendo
  // datos nuevos pinta "undefined" en la cara del usuario (visto el 2026-09-01, tras cambiar la
  // bitácora). Los datos dicen con qué esquema se generaron: si es más nuevo que el que este
  // código entiende, el que sobra es el código, y la única salida es traerlo de nuevo.
  const ESQUEMA_SOPORTADO = 2;
  function codigoViejo(d) {
    const v = (d && d.version_esquema) || 0;
    if (v <= ESQUEMA_SOPORTADO) return false;
    // Una sola recarga por versión: si aun así no se actualiza, es mejor mostrar el tablero
    // imperfecto que dejar al usuario en un ciclo de recargas.
    let yaIntentado = false;
    try { yaIntentado = sessionStorage.getItem('recarga-esquema') === String(v); } catch (e) { /* modo privado */ }
    if (yaIntentado) return false;
    try { sessionStorage.setItem('recarga-esquema', String(v)); } catch (e) { /* ignorar */ }
    const err = $('login-error');
    if (err) err.textContent = 'El tablero se actualizó. Recargando…';
    // Una URL distinta obliga a pedir el index.html de nuevo; location.reload() puede
    // reutilizar el que está en caché, que es justo el problema.
    location.replace(location.pathname + '?r=' + Date.now());
    return true;
  }

  async function entrar(ev) {
    ev.preventDefault();
    const btn = $('btn-entrar'); const err = $('login-error');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Abriendo…';
    try {
      DATOS = await Auth.abrir($('usuario').value, $('clave').value);
      $('clave').value = '';
      if (codigoViejo(DATOS)) return;          // se recarga sola; no vale la pena pintar nada
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
    FESTIVOS = new Set(DATOS.festivos || []);
    const personas = personasDisponibles();
    PERSONA = DATOS.rol === 'admin' ? 'TODAS' : personas[0];
    SECCION = 'resumen';
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

  // Contadores que van en la pestaña de cada sección: sirven para ver de un vistazo dónde
  // hay trabajo pendiente sin tener que entrar a mirar.
  function contadorSeccion(k) {
    if (k === 'gestion') return { n: sumaPorPersona(DATOS.gestion_dia_anterior, (b) => b.resumen.n_empresas) };
    if (k === 'agenda') return { n: entrevistasVisibles().length };
    if (k === 'auto') {
      const alerta = sumaPorPersona(DATOS.autodiligenciamiento, (b) => (b.alertas || []).length);
      return { n: sumaPorPersona(DATOS.autodiligenciamiento,
                 (b) => (b.pendientes || []).length + (b.incompletas_aplicadas || []).length), alerta: alerta > 0 };
    }
    return {};
  }

  function sumaPorPersona(bloque, f) {
    const pp = (bloque || {}).por_persona || {};
    return personasActivas().reduce((a, p) => a + (pp[p] ? (f(pp[p]) || 0) : 0), 0);
  }

  // Las personas cuyos datos hay que mostrar ahora mismo: las tres si el admin está en
  // "Todo el equipo", o solo la seleccionada.
  function personasActivas() {
    return PERSONA === 'TODAS' ? personasDisponibles() : [PERSONA];
  }

  // Entrevistas de la semana que corresponden a la persona seleccionada. Al admin le llegan
  // TODAS (su paquete no viene filtrado por persona, a diferencia del de cada encuestador),
  // así que sin esto el "Tablero de Ángela" mostraba citas de Diana y Leonardo como si
  // fueran suyas — visto el 2026-08-28.
  function entrevistasVisibles() {
    const ents = (DATOS.agenda_semana || {}).entrevistas || [];
    return PERSONA === 'TODAS' ? ents : ents.filter((f) => f.persona === PERSONA);
  }

  function renderSecciones() {
    const nav = $('t-secciones'); nav.innerHTML = '';
    SECCIONES.filter((s) => !s.soloAdmin || DATOS.rol === 'admin').forEach((sec) => {
      const c = contadorSeccion(sec.k);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab' + (sec.k === SECCION ? ' activa' : '');
      b.innerHTML = esc(sec.t) + (c.n ? ` <span class="n${c.alerta ? ' alerta' : ''}">${c.n}</span>` : '');
      b.addEventListener('click', () => { SECCION = sec.k; abierta = null; render(); window.scrollTo(0, 0); });
      nav.appendChild(b);
    });
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
    renderCabecera();
    const aviso = $('t-aviso');
    if (r.modo_heuristico > 0) {
      aviso.textContent = r.modo_modelo > 0
        ? `${r.modo_heuristico} de estas empresas todavía no las revisó el modelo (quedaron en heurística: reglas sobre cabeceras de correo y palabras clave). Sus estados son una aproximación.`
        : 'Esta corrida se hizo en modo heurístico (reglas sobre cabeceras de correo y palabras clave, sin el modelo). Los estados son una aproximación; la corrida con claude-sonnet-5 los afina.';
      aviso.classList.remove('oculto');
    } else aviso.classList.add('oculto');

    renderSecciones();
    SECCIONES.forEach((sec) => $('sec-' + sec.k).classList.toggle('oculto', sec.k !== SECCION));
    if (SECCION === 'resumen') {
      renderHero(r); renderFeedback(); renderBarra(r); renderHoy(); renderSeguimientos(); renderTabla();
    } else if (SECCION === 'gestion') renderGestion();
    else if (SECCION === 'agenda') renderAgenda();
    else if (SECCION === 'auto') renderAuto();
    else if (SECCION === 'comparacion') renderComparacion();
    else if (SECCION === 'bitacora') renderBitacora();
  }

  // Fecha, hora y sello de la corrida + aviso si los datos no son del último día hábil.
  // El sello es el mismo que valida el agente contra lo que sirve GitHub Pages: si aquí se
  // ve uno y en el correo otro, es que algo no se publicó.
  function renderCabecera() {
    const hora = (DATOS.actualizado_en || DATOS.generado_en || '').slice(11, 16);
    $('t-meta').innerHTML = `Actualizado el ${esc(fmtDiaFecha(DATOS.fecha_corrida))}` +
      (hora ? ` a las ${esc(hora)}` : '') +
      (DATOS.sello ? ` · <span class="sello" title="Identificador de esta corrida. Debe coincidir con el del correo diario.">sello ${esc(DATOS.sello)}</span>` : '');

    const d = $('t-desfase');
    const ahora = new Date();
    const esperado = iso(ultimoHabil(ahora));
    d.classList.add('oculto');
    d.classList.remove('en-curso');
    if (DATOS.fecha_corrida && DATOS.fecha_corrida < esperado) {
      // Dos situaciones muy distintas que antes se avisaban igual, en rojo:
      //
      //  (a) La corrida de hoy todavia no ha terminado. Es lo normal a primera hora: el
      //      2026-08-26 arranco 07:13 y tardo hasta pasado el mediodia porque OneDrive tenia
      //      42 archivos nuevos por descargar. No hay nada roto y no hay nada que reportar;
      //      decirle al encuestador que "avise a la coordinacion" vuelve el aviso ruido diario,
      //      y el dia que falle de verdad ya nadie lo mira.
      //  (b) Los datos llevan mas de un dia habil de atraso, o ya paso el mediodia y siguen
      //      sin llegar. Ahi si ocurrio algo (el push fallo, la corrida no se ejecuto).
      const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
      const unDiaHabil = iso(ultimoHabil(ayer));
      const recienteYTemprano = DATOS.fecha_corrida >= unDiaHabil && ahora.getHours() < 14;
      if (recienteYTemprano) {
        d.innerHTML = `<b>La corrida de hoy todavía no ha terminado.</b> Aquí ves los datos del ` +
          `${esc(fmtDiaFecha(DATOS.fecha_corrida))}, el último día hábil cerrado. El tablero se actualiza solo ` +
          `cuando la corrida termina de revisar la evidencia nueva; mientras tanto, guíate por el correo que ` +
          `recibiste hoy. No hay nada que reportar.`;
        d.classList.add('en-curso');
      } else {
        d.innerHTML = `<b>Estos datos no están al día.</b> Son de la corrida del ${esc(fmtDiaFecha(DATOS.fecha_corrida))}, ` +
          `y el último día hábil es ${esc(fmtDiaFecha(esperado))}. Lo que veas aquí puede no coincidir con tu correo ` +
          `de hoy: avísale a la coordinación para que revise la publicación del tablero.`;
      }
      d.classList.remove('oculto');
    }
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
        ${(() => {
          const c = conteosPorCategoria();
          const items = [
            { k: 'encuesta_diligenciada', txt: 'ya contestaron la encuesta' },
            { k: 'diligenciando', txt: 'diligenciando la encuesta ahora' },
            { k: 'agendada', txt: 'con entrevista agendada' },
            { k: 'aceptada', txt: 'aceptaron, falta coordinar fecha' },
            { k: 'respondio_sin_decision', txt: 'respondieron, sin decidir aún', extra: '· seguimiento a 3–4 días' },
            { k: 'no_participa', txt: 'no desean participar', extra: '· cerrada' },
          ];
          return `<ul class="desglose">` + items
            .filter((x) => c[x.k])
            .map((x) => `<li><span class="pt" style="background:${COLOR_CAT[x.k]}"></span> <b>${c[x.k]}</b> ${x.txt}${x.extra ? ` <span style="color:var(--gris)">${x.extra}</span>` : ''}</li>`)
            .join('') + `</ul>`;
        })()}
      </div>${colEnc}`;
  }

  function conteosPorCategoria() {
    const c = Object.fromEntries(CATEGORIAS.map((k) => [k, 0]));
    empresasActivas().forEach((e) => { c[categoria(e)]++; });
    return c;
  }

  // "Gestión efectiva" = respondieron con algo (aceptaron, agendaron, dijeron sí, respondieron
  // sin decidir, incluso rechazaron explícitamente). "Sin avance" = intentos sin respuesta o
  // carpeta vacía. Se separan visualmente con un espacio en la barra + dos leyendas apiladas.
  const CAT_EFECTIVA = ['encuesta_diligenciada', 'diligenciando', 'agendada', 'aceptada',
                        'respondio_sin_decision', 'no_participa'];
  const CAT_SIN_AVANCE = ['intento', 'sin_gestion'];

  function renderBarra(r) {
    const total = r.total || 1;
    const c = conteosPorCategoria();
    const suma = (arr) => arr.reduce((a, k) => a + c[k], 0);
    const nEf = suma(CAT_EFECTIVA), nSA = suma(CAT_SIN_AVANCE);
    const pct = (n) => (100 * n / total).toFixed(0);
    const seg = (grupo) => grupo
      .filter((k) => c[k])
      .map((k) => `<span style="flex:${c[k]};background:${COLOR_CAT[k]}" title="${ETIQUETA_CAT[k]}: ${c[k]}"></span>`)
      .join('');
    const item = (k) => `<span class="li"><i style="background:${COLOR_CAT[k]}"></i>${ETIQUETA_CAT[k]}: <b>${c[k]}</b> <span class="pct">(${pct(c[k])}%)</span></span>`;
    // Dos "sub-barras" con un pequeño gap entre ellas, proporcionales al total real.
    $('t-estado').innerHTML = `
      <div class="grupos" style="display:flex;gap:6px;align-items:stretch;margin:6px 0 10px">
        <div style="flex:${nEf || 0.001};display:flex;height:24px;border-radius:6px 0 0 6px;overflow:hidden;border:1px solid var(--linea);border-right:0">${seg(CAT_EFECTIVA)}</div>
        <div style="flex:${nSA || 0.001};display:flex;height:24px;border-radius:0 6px 6px 0;overflow:hidden;border:1px solid var(--linea);border-left:0">${seg(CAT_SIN_AVANCE)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:13px">
        <div>
          <div class="rot" style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--exito);margin-bottom:6px">Gestión efectiva · ${nEf} (${pct(nEf)}%)</div>
          <div class="leyenda">${CAT_EFECTIVA.map(item).join('')}</div>
        </div>
        <div>
          <div class="rot" style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--peligro);margin-bottom:6px">Sin avance · ${nSA} (${pct(nSA)}%)</div>
          <div class="leyenda">${CAT_SIN_AVANCE.map(item).join('')}</div>
        </div>
      </div>`;
  }

  // ---- Feedback de ayer: qué pasó con las N empresas que se propusieron ayer ----
  // Se muestra solo cuando hay datos de una lista previa. La corrida de HOY compara ids de la
  // lista de AYER contra el estado actual y los clasifica: cerradas (efectivas), a_seguimiento
  // (respondió sin decisión), rotadas (con evidencia de intento) o arrastradas (sin evidencia,
  // vuelven hoy). Ver agente/priorizar.py:calcular. Objetivo pedido por Eduard (2026-08-19):
  // que cada encuestador vea si logró convertir las propuestas de ayer en avance real.
  function bloquesFeedback(persona) {
    const p = (DATOS.prioridades || {})[persona];
    if (!p) return null;
    // El feedback compara la lista de ayer contra el estado de hoy. Si `fecha_lista_previa`
    // es la MISMA que la corrida actual, es que hoy ya hubo varias corridas y no hay
    // información nueva que comparar (visto 2026-08-19: dio 0/15 falso). Se oculta.
    if (p.fecha_lista_previa && p.fecha_lista_previa === DATOS.fecha_corrida) return null;
    const cerradas = (p.cerradas_desde_lista || []).length;
    const respondieron = (p.a_seguimiento || []).length;
    const rotadas = (p.rotadas_ayer || []).length;
    const arrastradas = (p.hoy || []).filter((x) => x.motivo === 'arrastrada').length;
    const total = cerradas + respondieron + rotadas + arrastradas;
    return { total, cerradas, respondieron, rotadas, arrastradas, fecha_prev: p.fecha_lista_previa };
  }

  function renderFeedback() {
    const cont = $('t-feedback');
    let personas = PERSONA === 'TODAS'
      ? (DATOS.personas || Object.keys(DATOS.resumen).filter((k) => k !== 'TOTAL'))
      : [PERSONA];
    const filas = personas.map((p) => ({ persona: p, ...(bloquesFeedback(p) || { total: 0 }) }))
                          .filter((f) => f.total > 0);
    if (!filas.length) {
      cont.classList.add('oculto');
      return;
    }
    const fechaPrev = filas[0].fecha_prev;
    cont.classList.remove('oculto');
    const agr = filas.reduce((a, f) => ({
      total: a.total + f.total, cerradas: a.cerradas + f.cerradas,
      respondieron: a.respondieron + f.respondieron, rotadas: a.rotadas + f.rotadas,
      arrastradas: a.arrastradas + f.arrastradas,
    }), { total: 0, cerradas: 0, respondieron: 0, rotadas: 0, arrastradas: 0 });
    const efec = agr.cerradas + agr.respondieron;
    const tasa = agr.total ? Math.round(100 * efec / agr.total) : 0;
    const desde = fechaPrev ? fmtFecha(fechaPrev) : 'la corrida anterior';
    const titulo = PERSONA === 'TODAS'
      ? `Feedback: qué pasó con las ${agr.total} empresas propuestas el ${desde} al equipo`
      : `Feedback: qué pasó con tus ${agr.total} empresas propuestas el ${desde}`;
    const items = [
      { c: '#147A3D', t: 'lograron contacto efectivo cerrado',
        n: agr.cerradas, ay: '(agendó, encuesta o rechazó explícito)' },
      { c: '#395CE0', t: 'respondieron sin decisión',
        n: agr.respondieron, ay: '(pasan a seguimiento a 3–4 días)' },
      { c: '#8A6D1F', t: 'con intento documentado, sin respuesta',
        n: agr.rotadas, ay: '(rotan unos días, dan espacio a otras)' },
      { c: '#B3261E', t: 'sin evidencia de intento',
        n: agr.arrastradas, ay: '(vuelven a salir hoy)' },
    ];
    const cuerpo = items.map((x) => x.n
      ? `<li style="display:flex;align-items:baseline;gap:10px;padding:4px 0">
           <span style="display:inline-block;width:38px;text-align:right;font-weight:700;color:${x.c};font-size:18px">${x.n}</span>
           <span>${x.t} <span style="color:var(--gris)">${x.ay}</span></span>
         </li>` : '').join('');
    cont.innerHTML = `
      <h2>${esc(titulo)}</h2>
      <p class="ayuda">Comparación entre las empresas propuestas en la corrida anterior y su estado hoy.
        Gestión efectiva de las de ayer: <b style="color:var(--exito)">${tasa}%</b>
        (${efec} de ${agr.total}).</p>
      <ul style="list-style:none;margin:8px 0 0;padding:0;font-size:14px">${cuerpo}</ul>`;
  }

  // ------------------------------------------------------- encuestas (SVG plano, sin librerías)
  const C_COMPLETA = '#147A3D', C_CURSO = '#8A6D1F';

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
    if (filtro.estado) f = f.filter((e) => categoria(e) === filtro.estado);
    if (filtro.declarado) f = f.filter((e) => (e.declarado.contacto || 'sin_registro') === filtro.declarado);
    if (filtro.discrep) f = f.filter((e) => e.verificado.coincide_con_declarado === false);
    const clave = {
      id: (e) => e.id, empresa: (e) => (e.empresa || '').toLowerCase(),
      estado: (e) => ESTADOS.indexOf(e.verificado.estado_verificado),
      declarado: (e) => e.declarado.contacto || 'zz', ultima: (e) => e.verificado.fecha_ultima_gestion || '',
      n_archivos: (e) => e.evidencia.n_archivos || 0,
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
        <td><span class="chip" style="background:${COLOR_CAT[categoria(e)]}">${ETIQUETA_CAT[categoria(e)]}</span></td>
        <td>${esc(e.declarado.contacto || '—')}${e.declarado.n_llamadas != null ? ` <span style="color:#88898C">· ${e.declarado.n_llamadas} llam.</span>` : ''}${v.coincide_con_declarado === false ? ' <span class="discrepancia" title="declarado ≠ evidencia">≠</span>' : ''}</td>
        <td>${fmtFecha(v.fecha_ultima_gestion)}</td>
        <td>${e.evidencia.n_archivos}${e.evidencia.n_relatorias ? ` <span style="color:#88898C">(${e.evidencia.n_relatorias} relat.)</span>` : ''}</td>
</tr>`;
      if (abierta !== e.id) return fila;
      const enc = e.encuesta;
      return fila + `<tr class="detalle"><td colspan="6"><div class="detalle-grid">
        ${enc && enc.diligenciada ? `<div style="grid-column:1/-1;background:#EAF5EE;border-radius:6px;padding:8px 10px;color:#0F5C2E">
           <b>Encuesta diligenciada</b> (${enc.porcentaje}%${enc.completa ? ', los 4 módulos' : ', con un módulo justificado como no aplicable'})
           ${enc.autodiligenciada ? '· la respondió la empresa por su cuenta' : (enc.aplicada_por ? `· la aplicó ${esc(NOMBRE_PERSONA[enc.aplicada_por] || enc.aplicada_por)}` : '')}
           ${enc.ultima_modificacion ? `· ${fmtFecha(enc.ultima_modificacion)}` : ''}. Por eso cuenta como contacto efectivo.
           ${v.ajuste_encuesta ? ` Antes de la encuesta, la evidencia documental por sí sola indicaba: <i>${esc(ETIQUETA[v.ajuste_encuesta.estado_agente] || v.ajuste_encuesta.estado_agente)}</i>.` : ''}
         </div>` : ''}
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
    }).join('') || '<tr><td colspan="6" class="vacio">Sin resultados para el filtro.</td></tr>';
    cuerpo.querySelectorAll('tr.fila').forEach((tr) => tr.addEventListener('click', () => { abierta = abierta === tr.dataset.id ? null : tr.dataset.id; renderTabla(); }));
    $('t-pag').innerHTML = `${f.length} empresas · página ${pagina} de ${paginas} ` +
      `<button class="boton secundario chico" ${pagina <= 1 ? 'disabled' : ''} id="pag-ant" type="button">‹</button>` +
      `<button class="boton secundario chico" ${pagina >= paginas ? 'disabled' : ''} id="pag-sig" type="button">›</button>`;
    const ant = $('pag-ant'), sig = $('pag-sig');
    if (ant) ant.addEventListener('click', () => { pagina--; renderTabla(); });
    if (sig) sig.addEventListener('click', () => { pagina++; renderTabla(); });
  }

  // =================================================== gestión del último día hábil
  const ETIQUETA_RES = {
    sin_respuesta: 'Sin respuesta', respondio: 'Respondió', acepto: 'Aceptó',
    rechazo: 'No participa', agendo: 'Agendó', diligencio: 'Diligenció', desconocido: 'Sin determinar'
  };
  const COLOR_RES = {
    sin_respuesta: '#8A6D1F', respondio: '#395CE0', acepto: '#A16207',
    rechazo: '#5A5C61', agendo: '#6B46C1', diligencio: '#0F5C2E', desconocido: '#88898C'
  };
  const ETIQUETA_CANAL = {
    correo: 'Correo', llamada: 'Llamada', whatsapp: 'WhatsApp', linkedin: 'LinkedIn',
    apollo: 'Apollo', reunion: 'Reunión', visita: 'Visita', otro: 'Sin clasificar'
  };
  const COLOR_CANAL = {
    correo: '#395CE0', llamada: '#0E9384', whatsapp: '#147A3D', linkedin: '#2743B8',
    apollo: '#6B46C1', reunion: '#A16207', visita: '#C0562F', otro: '#88898C'
  };
  const vacio = (txt) => `<p class="vacio">${esc(txt)}</p>`;

  function renderGestion() {
    const g = DATOS.gestion_dia_anterior || {};
    $('t-gestion-titulo').textContent = `Gestión del ${g.dia || 'último día hábil'}`;
    $('t-gestion-ayuda').textContent =
      'Qué empresas se trabajaron ese día, por qué medio y en qué quedó cada una. ' +
      'Se toma siempre el último día hábil: el lunes muestra el viernes.';
    const cont = $('t-gestion');
    const pp = g.por_persona || {};
    const html = personasActivas().map((p) => {
      const b = pp[p];
      if (!b) return '';
      const r = b.resumen;
      const canales = Object.entries(r.por_canal || {})
        .map(([c, n]) => `<span class="chip" style="background:${COLOR_CANAL[c] || '#88898C'}">${esc(ETIQUETA_CANAL[c] || c)}: ${n}</span>`).join(' ');
      const filas = (b.empresas || []).map((f) => `<tr>
        <td><div class="empresa">${esc(f.empresa)}</div><div class="nota">id ${esc(f.id)}</div></td>
        <td><div class="chips">${f.canales.map((c) => `<span class="chip" style="background:${COLOR_CANAL[c] || '#88898C'}">${esc(ETIQUETA_CANAL[c] || c)}</span>`).join('')}</div></td>
        <td>${esc(f.detalle || '—')}${f.n_gestiones > 1 ? `<div class="nota">${f.n_gestiones} gestiones ese día</div>` : ''}</td>
        <td><span class="chip" style="background:${COLOR_RES[f.resultado] || '#88898C'}">${esc(ETIQUETA_RES[f.resultado] || f.resultado)}</span></td>
        <td>${f.agendo ? '<span class="chip" style="background:#6B46C1">Quedó cita</span>' : (f.genero_seguimiento ? '<span class="chip" style="background:#395CE0">Seguimiento</span>' : '<span class="chip tenue">—</span>')}
            <div class="nota">${esc(f.siguiente_paso || '')}</div></td></tr>`).join('');
      // El origen "evidencia" significa que el detalle se dedujo de los nombres de archivo
      // porque el modelo aún no ha revisado esas empresas con el esquema nuevo. Decirlo evita
      // que alguien lea "Sin determinar" como "el encuestador no hizo nada".
      const derivadas = (b.empresas || []).filter((f) => f.origen === 'evidencia').length;
      return `<div class="gestion-persona">
        <h3>${esc(NOMBRE_PERSONA[p] || p)}</h3>
        <div class="cifras">
          <span><b>${r.n_empresas}</b> empresas gestionadas</span>
          <span><b>${r.n_gestiones}</b> gestiones</span>
          <span><b>${r.con_respuesta}</b> con respuesta</span>
          <span><b>${r.con_seguimiento}</b> dejaron seguimiento</span>
          <span><b>${r.agendadas}</b> terminaron en cita</span>
        </div>
        <div class="chips" style="margin-bottom:10px">${canales}</div>
        ${filas ? `<div class="tabla-wrap"><table class="compacta">
            <thead><tr><th>Empresa</th><th>Medio</th><th>Qué se hizo</th><th>Resultado</th><th>¿Quedó algo?</th></tr></thead>
            <tbody>${filas}</tbody></table></div>` : vacio('Sin gestiones documentadas ese día.')}
        ${derivadas ? `<p class="ayuda" style="margin:10px 0 0"><b>Por qué aparece "Sin clasificar" o "Sin determinar":</b>
           ${derivadas} de estas empresas se revisaron antes de que el agente empezara a registrar el detalle de cada
           gestión. Para ellas solo se sabe lo que dice el <i>nombre</i> del archivo: un <code>.docx</code> es la
           relatoría del día —hubo gestión, seguro— pero el nombre no dice si fue llamada, WhatsApp o visita, ni cómo
           terminó. El agente las está reprocesando de a pocas por noche, empezando por las de evidencia más reciente;
           la evidencia que se suba de ahora en adelante ya sale con el medio y el resultado completos.</p>` : ''}
      </div>`;
    }).join('');
    cont.innerHTML = html || vacio('Sin datos de gestión para ese día.');
  }

  // =================================================== agenda de la semana
  const ETIQUETA_EST_ENT = {
    pendiente: 'Pendiente', realizada: 'Realizada', reagendada: 'Reagendada',
    cancelada: 'Cancelada', sin_confirmar: 'Sin confirmar'
  };
  const COLOR_EST_ENT = {
    pendiente: '#395CE0', realizada: '#0F5C2E', reagendada: '#A16207',
    cancelada: '#5A5C61', sin_confirmar: '#C0562F'
  };

  function renderAgenda() {
    const a = DATOS.agenda_semana || {};
    const ents = entrevistasVisibles();
    $('t-agenda-titulo').textContent = `Entrevistas agendadas: ${ents.length} esta semana`;
    $('t-agenda-ayuda').textContent =
      `Compromisos del ${fmtDiaFecha(a.desde)} al ${fmtDiaFecha(a.hasta)}. Salen de las fechas que cada ` +
      `encuestador escribe en su Excel y de las citas que el agente encuentra en las relatorías y correos. ` +
      `Si una cita aparece aquí y no en tu Excel, vale la pena pasarla al Excel.`;
    const hoyIso = iso(new Date());
    const filas = ents.map((f) => `<tr${f.fecha === hoyIso ? ' style="background:var(--azul-fondo)"' : ''}>
      <td><b>${esc(fmtFecha(f.fecha))}</b>${f.fecha === hoyIso ? '<div class="nota">hoy</div>' : ''}</td>
      <td>${esc(fmtHora(f.hora))}</td>
      <td><div class="empresa">${esc(f.empresa)}</div><div class="nota">id ${esc(f.id)}${f.modulos && f.modulos.length ? ' · módulos ' + esc(f.modulos.join(', ')) : ''}</div></td>
      <td>${esc(NOMBRE_PERSONA[f.persona] || f.persona)}</td>
      <td>${f.modalidad ? esc(f.modalidad === 'virtual' ? 'Virtual' : 'Presencial') : '<span style="color:var(--gris)">por definir</span>'}
          ${f.link ? `<div class="nota">tiene enlace de reunión</div>` : ''}
          ${f.origen === 'evidencia' ? `<div class="nota" title="La cita la detectó el agente en la relatoría o el correo, no está en el Excel">según la relatoría</div>` : ''}</td>
      <td><span class="chip" style="background:${COLOR_EST_ENT[f.estado] || '#88898C'}">${esc(ETIQUETA_EST_ENT[f.estado] || f.estado)}</span></td>
    </tr>`).join('');
    const sinFecha = (a.sin_fecha_legible || []).map((f) => `<li>
      <b>${esc(f.empresa)}</b> <span style="color:var(--gris)">· id ${esc(f.id)} · módulo ${esc(f.modulo)}</span> — anotado como “${esc(f.texto)}”</li>`).join('');
    $('t-agenda').innerHTML = (filas
      ? `<div class="tabla-wrap"><table class="compacta"><thead><tr>
           <th>Fecha</th><th>Hora</th><th>Empresa</th><th>Encuestador</th>
           <th>Modalidad</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>`
      : vacio('No hay entrevistas con fecha dentro de esta semana.'))
      + (sinFecha ? `<h3 style="font-size:14px;margin:20px 0 4px">Anotadas sin fecha legible</h3>
          <p class="ayuda">El Excel tiene algo escrito en la fecha de entrevista, pero no se puede leer como fecha. Hay que confirmarlas.</p>
          <ul style="margin:0;padding-left:18px;font-size:13.5px">${sinFecha}</ul>` : '');
  }

  // =================================================== diligenciamiento autónomo
  const MODULOS = ['P', 'INV', 'INT', 'INN'];
  const NOMBRE_MODULO = { P: 'Perfil', INV: 'Inversión', INT: 'Internacionalización', INN: 'Innovación' };
  const ETIQUETA_EST_AUTO = {
    en_curso: 'En curso', estancada: 'Sin avanzar', sin_iniciar: 'No ha abierto la encuesta', finalizada: 'Finalizada'
  };
  const COLOR_EST_AUTO = { en_curso: '#0E9384', estancada: '#C0562F', sin_iniciar: '#B3261E', finalizada: '#0F5C2E' };

  function pildorasModulos(ok) {
    const hechos = new Set(ok || []);
    return `<div class="modulos">${MODULOS.map((m) =>
      `<span class="${hechos.has(m) ? 'ok' : ''}" title="${esc(NOMBRE_MODULO[m])}${hechos.has(m) ? ': completo' : ': pendiente'}">${m}</span>`).join('')}</div>`;
  }

  function renderAuto() {
    const a = DATOS.autodiligenciamiento || {};
    const pp = a.por_persona || {};
    const total = sumaPorPersona(a, (b) => (b.pendientes || []).length);
    $('t-auto-titulo').textContent = `Diligenciamiento autónomo: ${total} sin terminar`;
    $('t-auto-ayuda').textContent =
      `Avance real de cada empresa según el Reporte 3i, para no tener que abrirlo a mano. ` +
      `Una empresa se marca sin avanzar cuando lleva más de ${a.dias_estancado || 3} días hábiles sin tocar la encuesta.`;
    $('t-auto').innerHTML = personasActivas().map((p) => {
      const b = pp[p];
      if (!b) return '';
      const r = b.resumen;
      const alertas = b.alertas || [];
      const filas = (b.pendientes || []).map((f) => `<tr>
        <td><div class="empresa">${esc(f.empresa)}</div><div class="nota">id ${esc(f.id)}${f.autodiligenciada ? '' : ' · marcada en el Excel'}</div></td>
        <td>${f.fecha_envio ? (f.fecha_envio_aproximada ? '≈ ' : '') + esc(fmtFecha(f.fecha_envio)) : '—'}
            ${f.fecha_envio_aproximada ? '<div class="nota" title="Se usa la fecha del último correo de la carpeta">aproximada</div>' : ''}</td>
        <td class="avance"><div class="barra-mini"><i style="width:${f.porcentaje || 0}%"></i></div><div class="pct">${f.porcentaje || 0}%</div></td>
        <td>${pildorasModulos(f.modulos_ok)}<div class="nota">${(f.modulos_pendientes || []).length
              ? 'faltan ' + esc((f.modulos_pendientes || []).map((m) => NOMBRE_MODULO[m] || m).join(', ')) : 'sin pendientes'}</div></td>
        <td>${f.ultima_actividad ? esc(fmtFecha(f.ultima_actividad)) : '—'}
            ${f.dias_sin_avance != null ? `<div class="nota">hace ${f.dias_sin_avance} día(s) hábil(es)</div>` : ''}</td>
        <td><span class="chip" style="background:${COLOR_EST_AUTO[f.estado] || '#88898C'}">${esc(ETIQUETA_EST_AUTO[f.estado] || f.estado)}</span></td>
      </tr>`).join('');
      const comp = (b.completadas || []).map((f) => `<li><b>${esc(f.empresa)}</b>
        <span style="color:var(--gris)">· id ${esc(f.id)} · ${f.porcentaje || 0}%${f.ultima_actividad ? ' · ' + esc(fmtFecha(f.ultima_actividad)) : ''}</span></li>`).join('');
      return `<div class="gestion-persona">
        ${PERSONA === 'TODAS' ? `<h3>${esc(NOMBRE_PERSONA[p] || p)}</h3>` : ''}
        <div class="cifras">
          <span><b>${r.con_avance}</b> con avance reciente</span>
          <span><b>${r.estancadas}</b> sin avanzar</span>
          <span><b>${r.sin_iniciar}</b> no han abierto la encuesta</span>
          <span><b>${r.finalizadas}</b> finalizadas</span>
        </div>
        ${alertas.length ? `<div class="aviso-modo" style="margin:0 0 12px"><b>Necesitan un recordatorio:</b>
           ${alertas.map((f) => esc(f.empresa) + ` (${f.dias_sin_avance} d)`).join(' · ')}</div>` : ''}
        ${filas ? `<div class="tabla-wrap"><table class="compacta"><thead><tr>
             <th>Empresa</th><th>Acceso enviado</th><th>Avance</th><th>Módulos</th><th>Última actividad</th><th>Estado</th>
           </tr></thead><tbody>${filas}</tbody></table></div>`
          : vacio('Ninguna empresa con diligenciamiento autónomo pendiente.')}
        ${(b.incompletas_aplicadas || []).length ? `
          <h3 style="font-size:14px;margin:20px 0 4px">Encuestas que ${PERSONA === 'TODAS' ? esc(NOMBRE_PERSONA[p] || p) + ' aplicó' : 'aplicaste'} y quedaron incompletas (${b.incompletas_aplicadas.length})</h3>
          <p class="ayuda">No son diligenciamiento autónomo: son entrevistas que quedaron a medias y también
            tienen módulos pendientes por cerrar.</p>
          <div class="tabla-wrap"><table class="compacta"><thead><tr>
            <th>Empresa</th><th>Avance</th><th>Módulos</th><th>Última actividad</th></tr></thead><tbody>
            ${b.incompletas_aplicadas.map((f) => `<tr>
              <td><div class="empresa">${esc(f.empresa)}</div><div class="nota">id ${esc(f.id)}${f.persona_cartera && f.persona_cartera !== f.aplicada_por ? ' · cartera de ' + esc(NOMBRE_PERSONA[f.persona_cartera] || f.persona_cartera) : ''}</div></td>
              <td class="avance"><div class="barra-mini"><i style="width:${f.porcentaje || 0}%"></i></div><div class="pct">${f.porcentaje || 0}%</div></td>
              <td>${pildorasModulos(f.modulos_ok)}<div class="nota">faltan ${esc((f.modulos_pendientes || []).map((m) => NOMBRE_MODULO[m] || m).join(', '))}</div></td>
              <td>${f.ultima_actividad ? esc(fmtFecha(f.ultima_actividad)) : '—'}
                  ${f.dias_sin_avance != null ? `<div class="nota">hace ${f.dias_sin_avance} día(s) hábil(es)</div>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>` : ''}
        ${comp ? `<h3 style="font-size:14px;margin:18px 0 4px">Finalizadas (${(b.completadas || []).length})</h3>
           <p class="ayuda">Ya terminaron la encuesta. Salen de pendientes y no requieren seguimiento.</p>
           <ul style="margin:0;padding-left:18px;font-size:13.5px;columns:2">${comp}</ul>` : ''}
      </div>`;
    }).join('') || vacio('Sin datos de diligenciamiento autónomo.');
  }

  // =================================================== comparación entre encuestadores
  // Semanas con actividad registrada, de la más reciente a la más antigua.
  //
  // Se incluyen las FUTURAS: son las citas ya agendadas para adelante y hay que poder verlas
  // (pedido de Eduard, 2026-08-31). Lo que no se hace es abrir el tablero en una de ellas —
  // una semana futura no tiene gestión, así que como vista de cumplimiento sale vacía; por eso
  // el valor por defecto es la semana en curso, no la más reciente del listado.
  function semanasDisponibles(pp, personas, semanaActual) {
    const ks = new Set(personas.flatMap((p) => Object.keys(pp[p].por_semana || {})));
    if (semanaActual) ks.add(semanaActual);
    return [...ks].sort().reverse();
  }

  function fmtSemana(lunes) {
    const d = new Date(lunes + 'T12:00:00');
    const v = new Date(d); v.setDate(v.getDate() + 4);           // lunes → viernes
    const mes = (x) => x.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    return `${d.getDate()} ${mes(d)} – ${v.getDate()} ${mes(v)}`;
  }

  // Cumplimiento contra la meta: devuelve el chip con el logro y lo esperado.
  function chipMeta(logrado, meta) {
    const ok = logrado >= meta;
    return `<b style="color:${ok ? 'var(--verde, #0F5C2E)' : '#C0562F'}">${logrado}</b>` +
           `<span style="color:var(--gris-oscuro)"> / ${meta}</span>` +
           (ok ? ' <span title="meta cumplida">✓</span>' : '');
  }

  function renderComparacion() {
    const c = DATOS.comparativo || {};
    const pp = c.por_persona || {};
    const personas = personasDisponibles().filter((p) => pp[p]);
    if (!personas.length) { $('t-comparacion').innerHTML = `<div class="tarjeta">${vacio('Sin datos comparativos.')}</div>`; return; }

    // 0. El corte por semana se resuelve ANTES que nada: manda sobre las tarjetas de volumen y
    //    sobre el reparto por medio, no solo sobre la tabla de cumplimiento (pedido de Eduard,
    //    2026-08-31). 'todo' devuelve la vista acumulada desde el inicio del proyecto.
    const metas = c.metas || { contactos_efectivos_dia: 5, agendadas_semana: 3, dias_habiles_semana: 5 };
    const semanaActual = (c.semana || [])[0] || null;   // lunes de la semana hábil en curso
    const semanas = semanasDisponibles(pp, personas, semanaActual);
    if (SEMANA === null || (SEMANA !== 'todo' && !semanas.includes(SEMANA))) {
      SEMANA = semanaActual || semanas[0] || 'todo';
    }
    const acumulado = SEMANA === 'todo';
    const metaContactos = metas.contactos_efectivos_dia * metas.dias_habiles_semana;
    const futura = (k) => semanaActual && k > semanaActual;
    const VACIA = { gestiones: 0, empresas: 0, contactadas: 0, efectivas: 0, solo_correo: 0,
                    agendadas: 0, realizadas: 0, por_medio: {} };
    const bloqueDe = (p) => (pp[p].por_semana || {})[SEMANA] || VACIA;
    // Rótulo que se cuelga de cada título para que nunca se lea una cifra sin saber de qué periodo es.
    const corte = acumulado ? 'todo el proyecto' : fmtSemana(SEMANA);
    // Una semana recién empezada sale en ceros. Sin decirlo, cuatro tarjetas en cero parecen un
    // tablero roto; con esto se lee como lo que es: la semana todavía no tiene gestión cargada.
    const vacioCorte = !acumulado && personas.every((p) => !bloqueDe(p).gestiones && !bloqueDe(p).agendadas);
    const avisoCorte = vacioCorte
      ? `<p class="ayuda" style="color:#C0562F"><b>Sin gestión registrada en ${esc(corte)}.</b>
         ${futura(SEMANA) ? 'Es una semana futura: aquí solo aparecerían las citas ya agendadas para esos días.'
           : 'La gestión de la semana anterior no se mueve a esta; elige otra semana en el filtro o mira el acumulado.'}</p>`
      : '';
    const selector = `<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">Semana
      <select id="f-semana" style="font-weight:400;max-width:320px">
        <option value="todo"${acumulado ? ' selected' : ''}>Todo el proyecto (acumulado)</option>
        ${semanas.map((k) => `<option value="${esc(k)}"${k === SEMANA ? ' selected' : ''}>${esc(fmtSemana(k))}${
          k === semanaActual ? ' · esta semana' : (futura(k) ? ' · próxima' : '')}</option>`).join('')}
      </select></label>`;

    // 1. Volumen: las cifras crudas, lado a lado. Acumuladas o de la semana elegida.
    const tarjetas = personas.map((p) => {
      const x = pp[p], b = bloqueDe(p);
      const fila = (t, v, cls) => `<dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd>`;
      const cuerpo = acumulado ? `
        ${fila('Entrevistas realizadas', x.entrevistas_realizadas_total, 'destacado')}
        ${fila('Realizadas esta semana', x.entrevistas_realizadas_semana)}
        ${fila('Entrevistas agendadas', x.entrevistas_agendadas)}
        ${fila('Agendadas por venir', x.agendadas_proximas)}
        ${fila('Empresas contactadas', x.empresas_gestionadas)}
        ${fila('Empresas que respondieron', x.empresas_con_respuesta)}
        ${fila('Solo correo, sin respuesta', x.empresas_solo_correo)}
        ${fila('Gestiones registradas', x.gestiones_realizadas)}` : `
        ${fila('Encuestas hechas', b.realizadas, 'destacado')}
        ${fila('Citas con fecha en la semana', b.agendadas)}
        ${fila('Empresas contactadas', b.contactadas)}
        ${fila('Empresas que respondieron', b.efectivas)}
        ${fila('Solo correo, sin respuesta', b.solo_correo)}
        ${fila('Gestiones registradas', b.gestiones)}`;
      return `<div class="comp-tarjeta"><h3>${esc(NOMBRE_PERSONA[p] || p)}</h3><dl>${cuerpo}</dl></div>`;
    }).join('');

    // 2. Medios: en qué reparte cada quien su esfuerzo. También sigue el corte de la semana.
    const medioDe = (p) => (acumulado ? pp[p].por_medio : bloqueDe(p).por_medio) || {};
    const mediosBarra = [...new Set(personas.flatMap((p) => Object.keys(medioDe(p))))];
    const barras = personas.map((p) => {
      const m = medioDe(p), tot = Object.values(m).reduce((a, n) => a + n, 0);
      const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
      const segs = Object.entries(m)
        .map(([k, n]) => `<span style="flex:${n};background:${COLOR_CANAL[k] || '#88898C'}" title="${esc(ETIQUETA_CANAL[k] || k)}: ${n} (${Math.round(100 * n / tot)}%)"></span>`).join('');
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <b>${esc(NOMBRE_PERSONA[p] || p)}</b>
          <span style="color:var(--gris-oscuro)">${tot ? `más usado: ${esc(ETIQUETA_CANAL[top[0]] || top[0])}` : 'sin gestiones en este corte'}</span></div>
        <div class="barra-medios">${segs}</div></div>`;
    }).join('');
    const leyenda = mediosBarra.map((m) =>
      `<span class="li"><i style="background:${COLOR_CANAL[m] || '#88898C'}"></i>${esc(ETIQUETA_CANAL[m] || m)}</span>`).join('');

    // 3. Tasa de respuesta por medio: una fila por persona, una columna por medio.
    // Esta y las dos siguientes son SIEMPRE acumuladas: son razones sobre el universo de
    // empresas de cada quien (¿de las que toqué por llamada, cuántas respondieron?), y una
    // empresa tocada en marzo puede responder en agosto. Partirlas por semana daría un número
    // que parece una tasa y no lo es.
    const todosMedios = [...new Set(personas.flatMap((p) =>
      Object.keys(pp[p].por_medio || {}).concat(Object.keys(pp[p].tasa_por_medio || {}))))];
    // "Sin clasificar" no es un medio de contacto: una tasa de respuesta sobre él no significa
    // nada. Se muestra en el reparto (es esfuerzo real) pero no en la comparación de medios.
    const mediosTasa = todosMedios.filter((m) => m !== 'otro');
    const tasas = `<div class="tabla-wrap"><table class="compacta"><thead><tr><th>Encuestador</th>
      ${mediosTasa.map((m) => `<th>${esc(ETIQUETA_CANAL[m] || m)}</th>`).join('')}<th>Mejor medio</th></tr></thead><tbody>
      ${personas.map((p) => {
        const x = pp[p];
        return `<tr><td class="empresa">${esc(NOMBRE_PERSONA[p] || p)}</td>${mediosTasa.map((m) => {
          const t = (x.tasa_por_medio || {})[m];
          if (!t) return '<td style="color:var(--gris)">—</td>';
          const mejor = x.medio_mas_efectivo === m;
          return `<td${mejor ? ' style="background:#EAF5EE"' : ''}><b>${t.tasa}%</b>
            <div class="nota">${t.respondieron} de ${t.empresas}</div></td>`;
        }).join('')}<td><b>${esc(ETIQUETA_CANAL[x.medio_mas_efectivo] || '—')}</b></td></tr>`;
      }).join('')}</tbody></table></div>`;

    // 4. Conversión: del contacto a la cita, y de la cita a la encuesta hecha.
    const conv = `<div class="tabla-wrap"><table class="compacta"><thead><tr>
      <th>Encuestador</th><th>Contactadas</th><th>→ Agendadas</th><th>Conversión</th>
      <th>→ Con encuesta</th><th>Conversión</th></tr></thead><tbody>
      ${personas.map((p) => { const x = pp[p]; return `<tr>
        <td class="empresa">${esc(NOMBRE_PERSONA[p] || p)}</td>
        <td>${x.empresas_gestionadas}</td><td>${x.entrevistas_agendadas}</td>
        <td><b>${x.conversion_contacto_agendada}%</b></td>
        <td>${x.agendadas_con_encuesta}</td>
        <td><b>${x.conversion_agendada_realizada}%</b></td></tr>`; }).join('')}
      </tbody></table></div>`;

    // 5. Cumplimiento contra la meta. Solo tiene sentido con una semana elegida: la meta es
    // semanal, así que sumar todo el proyecto contra "5 al día" no compara nada.
    const filaSemana = (p) => {
      const b = bloqueDe(p);
      return `<tr><td class="empresa">${esc(NOMBRE_PERSONA[p] || p)}</td>
        <td>${b.empresas}</td>
        <td>${chipMeta(b.efectivas, metaContactos)}</td>
        <td>${chipMeta(b.agendadas, metas.agendadas_semana)}</td>
        <td>${pp[p].entrevistas_agendadas}<div class="nota">${pp[p].agendadas_proximas} por venir</div></td>
        <td>${b.realizadas}</td>
        <td>${b.gestiones}</td></tr>`;
    };
    const bloqueSemana = `<div class="tarjeta">
      <h2>Cumplimiento por semana</h2>
      <p class="ayuda">El filtro de arriba manda sobre <b>todo lo que se puede partir por semana</b>:
        esta tabla, el volumen de gestión y el reparto por medio. Meta acordada:
        <b>${metas.contactos_efectivos_dia} contactos efectivos al día</b>
        (${metaContactos} en una semana de ${metas.dias_habiles_semana} días hábiles) y
        <b>${metas.agendadas_semana} entrevistas agendadas por semana</b>.
        Un contacto es <i>efectivo</i> cuando la empresa dio alguna señal de vuelta: aceptó, rechazó,
        agendó, diligenció o respondió sin decidir. Los correos enviados sin respuesta no cuentan.
        Solo entran las gestiones con fecha conocida. <b>Agendadas esta semana</b> son las citas cuya
        fecha cae en la semana elegida; <b>Agendadas en total</b> cuenta todas las citas registradas,
        incluidas las de semanas próximas, para que ninguna quede escondida por el filtro.</p>
      <div style="margin:0 0 14px">${selector}</div>
      ${acumulado ? vacio('La meta es semanal. Elige una semana en el filtro para ver el cumplimiento.')
        : `<div class="tabla-wrap"><table class="compacta"><thead><tr>
          <th>Encuestador</th><th>Empresas gestionadas</th><th>Contactos efectivos</th>
          <th>Agendadas esta semana</th><th>Agendadas en total</th>
          <th>Encuestas hechas</th><th>Gestiones</th></tr></thead>
        <tbody>${personas.map(filaSemana).join('')}</tbody></table></div>`}
    </div>`;

    $('t-comparacion').innerHTML = bloqueSemana + `
      <div class="tarjeta"><h2>Volumen de gestión <span class="nota" style="font-weight:400">· ${esc(corte)}</span></h2>
        <p class="ayuda">Las cifras de cada encuestador, lado a lado, para el corte elegido arriba.
          <b>Contactadas</b> son las empresas con una gestión real documentada: llamada, WhatsApp, LinkedIn,
          visita o una respuesta de la empresa. Siguiendo la regla del proyecto, <i>no</i> cuentan las que solo
          tienen correos enviados sin respuesta — esas se muestran aparte. <b>Respondieron</b> son las que dieron
          alguna señal de vuelta (aceptaron, rechazaron o contestaron sin decidir); siempre son un subconjunto de
          las contactadas.${acumulado ? '' : ' Con una semana elegida, una misma empresa puede ser "solo correo" en una semana y "contactada" en otra: se juzga la gestión de esa semana, no su historia completa.'}</p>
        ${avisoCorte}<div class="comp-grid">${tarjetas}</div></div>
      <div class="tarjeta"><h2>Cómo contacta cada uno <span class="nota" style="font-weight:400">· ${esc(corte)}</span></h2>
        <p class="ayuda">Reparto de las gestiones por medio. Muestra si alguien está apoyándose casi solo en el
          correo mientras otro combina llamada y WhatsApp. "Sin clasificar" son relatorías que el modelo
          todavía no ha leído con el detalle nuevo: es gestión real, pero aún no se sabe por qué medio fue.</p>
        ${barras}<div class="leyenda" style="flex-direction:row;flex-wrap:wrap;gap:12px">${leyenda}</div></div>
      <div class="tarjeta"><h2>Qué medio funciona mejor a cada uno <span class="nota" style="font-weight:400">· acumulado</span></h2>
        <p class="ayuda">De las empresas tocadas por cada medio, cuántas respondieron. <b>No sigue el filtro de
          semana</b>: es una razón sobre el universo completo de empresas de cada quien, y una empresa tocada en
          marzo puede responder en agosto. Ojo: una empresa contactada por correo <i>y</i> por llamada cuenta en
          las dos columnas, así que esto compara personas entre sí, no demuestra que un medio cause la respuesta.
          En verde, el mejor medio de cada quien (mínimo 5 empresas).</p>
        ${tasas}</div>
      <div class="tarjeta"><h2>Del contacto a la encuesta <span class="nota" style="font-weight:400">· acumulado</span></h2>
        <p class="ayuda">Dónde se pierde cada embudo: quién agenda mucho pero concreta poco, y al revés.
          Tampoco sigue el filtro de semana, por lo mismo: el contacto y la encuesta casi nunca caen en la misma
          semana. "Con encuesta" son las empresas <i>agendadas</i> que además terminaron el cuestionario; el total
          de encuestas de cada uno es mayor, porque muchas se logran sin cita previa o las diligencia la empresa sola.</p>
        ${conv}</div>
      <div class="tarjeta"><h2>Encuestas por encuestador <span class="nota" style="font-weight:400">· acumulado</span></h2>
        <p class="ayuda">Diligenciadas frente a las que siguen en curso.</p>
        ${svgEquipo()}</div>`;

    // Cambiar de semana solo redibuja esta sección; no toca la persona ni la pestaña activas.
    const sel = $('f-semana');
    if (sel) sel.addEventListener('change', () => { SEMANA = sel.value; renderComparacion(); });
  }

  // =================================================== bitácora diaria
  function renderBitacora() {
    const b = DATOS.bitacora || { dias: [] };
    const sel = $('f-fecha');
    if (!b.dias.length) {
      sel.innerHTML = ''; $('t-bitacora').innerHTML = vacio('Todavía no hay días con gestión registrada.');
      return;
    }
    if (sel.options.length !== b.dias.length) {
      sel.innerHTML = b.dias.map((d) => `<option value="${esc(d.fecha)}">${esc(d.dia)}</option>`).join('');
      sel.addEventListener('change', renderBitacora);
    }
    const dia = b.dias.find((d) => d.fecha === sel.value) || b.dias[0];
    sel.value = dia.fecha;
    $('t-bitacora').innerHTML = personasActivas().map((p) => {
      const bloque = (dia.por_persona || {})[p];
      if (!bloque) return '';
      // Cinturón y tirantes: si algún día los datos y este código se desfasan otra vez, se ve
      // un cero, no la palabra "undefined".
      const r0 = bloque.resumen || {};
      const r = new Proxy(r0, { get: (o, k) => (o[k] === undefined || o[k] === null ? 0 : o[k]) });
      // Una empresa por fila: las que esa persona INTENTÓ contactar ese día, respondieran o no.
      const filas = (bloque.empresas || []).map((f) => `<tr class="${f.efectivo ? '' : 'no-gestionada'}">
        <td><div class="empresa">${esc(f.empresa)}</div>
            <div class="nota">id ${esc(f.id)}${f.de_la_lista ? '' : ' · <b>por su cuenta</b>'}</div></td>
        <td>${f.efectivo ? '<span class="chip" style="background:#147A3D">Respondió</span>'
                         : '<span class="chip" style="background:#88898C">Sin respuesta</span>'}</td>
        <td><div class="chips">${(f.medios || []).map((m) => `<span class="chip" style="background:${COLOR_CANAL[m] || '#88898C'}">${esc(ETIQUETA_CANAL[m] || m)}</span>`).join('') || '<span class="chip tenue">—</span>'}${
            f.n_gestiones > 1 ? `<span class="chip tenue">${f.n_gestiones} intentos</span>` : ''}</div></td>
        <td>${f.resultado ? `<span class="chip" style="background:${COLOR_RES[f.resultado] || '#88898C'}">${esc(ETIQUETA_RES[f.resultado] || f.resultado)}</span>` : '<span class="chip tenue">—</span>'}</td>
        <td>${esc(f.observacion || '—')}</td>
        <td>${esc(f.siguiente_accion || '—')}</td></tr>`).join('');
      // Las propuestas que ese día no se tocaron. Ya no es una nota de incumplimiento: es la
      // lista de lo que quedó pendiente y el agente sigue recomendando.
      const pend = (bloque.sugeridas_sin_tocar || []).map((x) =>
        `<li>${esc(x.empresa)} <span class="nota">(id ${esc(x.id)})</span></li>`).join('');
      return `<div class="gestion-persona">
        ${PERSONA === 'TODAS' ? `<h3>${esc(NOMBRE_PERSONA[p] || p)}</h3>` : ''}
        <div class="bit-resumen">
          <div><div class="v">${r.contactadas}</div><div class="e">Empresas intentadas</div></div>
          <div><div class="v si">${r.efectivas}</div><div class="e">Respondieron</div></div>
          <div><div class="v no">${r.sin_respuesta}</div><div class="e">Sin respuesta</div></div>
          <div><div class="v">${r.gestiones}</div><div class="e">Intentos</div></div>
          <div><div class="v">${r.entrevistas_agendadas}</div><div class="e">Citas logradas</div></div>
        </div>
        <p class="ayuda">Las empresas a las que esta persona le intentó llegar ese día, hayan respondido o no.
          Salen de la evidencia fechada ese día, no de la lista sugerida: por eso aparecen también las que
          buscó por su cuenta (${r.por_su_cuenta} de ${r.contactadas}; ${r.de_la_lista} venían de la lista del agente).
          Una empresa con varios intentos el mismo día es <b>una sola fila</b>, con el mejor resultado del día.</p>
        ${filas ? `<div class="tabla-wrap"><table class="compacta"><thead><tr>
          <th>Empresa</th><th>¿Respondió?</th><th>Medio</th><th>Resultado</th><th>Observación</th><th>Siguiente acción</th>
        </tr></thead><tbody>${filas}</tbody></table></div>`
        : vacio('No quedó evidencia de gestión ese día.')}
        ${pend ? `<h3 style="font-size:14px;margin:18px 0 4px">De la lista sugerida, quedaron sin tocar (${bloque.sugeridas_sin_tocar.length} de ${r.sugeridas})</h3>
          <p class="ayuda">No es un reproche: puede que ese día hubiera algo más urgente. Se listan porque
            siguen pendientes y el agente las vuelve a proponer.</p>
          <ul style="margin:0;padding-left:18px;font-size:13.5px;columns:2">${pend}</ul>` : ''}
      </div>`;
    }).join('') || vacio('Sin gestión registrada para esa fecha.');
  }

  document.addEventListener('DOMContentLoaded', inicio);
})();
