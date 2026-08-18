# camara-encuestas · página de seguimiento del Proyecto 3i

Sitio estático (GitHub Pages) donde el equipo de campo del proyecto **Diagnóstico 3i**
(CIENFI – Universidad Icesi / Cámara de Comercio de Cali) consulta el avance **verificado**
de sus empresas asignadas.

**https://cienfi-icesi.github.io/camara-encuestas/**

## Qué hay aquí y qué no

Este repositorio contiene **únicamente la página**: `index.html`, `css/`, `js/`, `logos/` y
`data/` con la porción de cada usuario **cifrada**. No contiene el agente, ni los Excel del
proyecto, ni la evidencia documental, ni ningún dato personal en claro.

Los datos los produce un agente que corre **local, en el Mac de la coordinación** (repositorio
aparte, no público): lee el estado declarado y la evidencia, corrobora empresa por empresa,
cifra la porción de cada usuario y hace push aquí. Nada de eso ocurre en GitHub.

## Por qué los datos están cifrados

GitHub Pages es público: cualquier archivo que se sirva aquí lo puede leer cualquiera, con o
sin pantalla de login. Por eso `data/<usuario>.enc.json` está cifrado con **AES-256-GCM** y una
clave derivada de la contraseña del usuario con **PBKDF2-SHA256 (210 000 iteraciones)**.
"Iniciar sesión" en esta página es literalmente *descifrar*: sin la contraseña correcta el
archivo es ruido, y cada persona solo puede abrir el suyo.

La contraseña actual es la cédula — un secreto **débil** (10 dígitos, a menudo conocidos por
terceros): protege frente a un curioso, no frente a un atacante decidido. Cambiarla no requiere
tocar este repositorio: se edita en el aplicativo del agente y se vuelve a publicar.

## Estructura

```
index.html          pantalla de ingreso + tablero
css/styles.css
js/auth.js          descifra el paquete del usuario en el navegador
js/app.js           arma el tablero
logos/
data/usuarios.json  índice público (usuario, nombre, rol) — sin contraseñas
data/*.enc.json     una porción cifrada por usuario  ← se regeneran en cada corrida
.nojekyll           Pages sirve los archivos tal cual, sin pasar por Jekyll
```

## Publicación

Pages está configurado como *Deploy from a branch* → `main` / `/ (root)`. No hay workflow de
Actions ni secretos configurados en el repositorio: todo llega ya cifrado en el push.

Para verlo en local hace falta servirlo por HTTP — abrir `index.html` con doble clic
(`file://`) hace que el navegador bloquee el `fetch()` de los datos:

```bash
python3 -m http.server 8811
```
