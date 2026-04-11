# Validacion del avatar pipeline

Este workflow mide la entrega de avatares en un build parecido al de produccion, no en `next dev`.

El alcance es deliberadamente acotado:

- compilar la app
- levantar `next start`
- abrir `/` con un contexto nuevo de Playwright
- cargar un root fijo (`Damus` por default)
- leer los contadores existentes del runtime de imagenes a traves de un probe habilitado por query param

## Que mide

El probe expone los contadores que importan para el avatar pipeline:

- requests visibles en cola
- requests visibles en vuelo
- presion critica de cola e in-flight en la base visible
- nodos visibles listos en runtime
- nodos visibles efectivamente pintados
- brecha entre runtime y paint
- nodos visibles pendientes en la icon layer
- sources que cayeron a proxy fallback
- backlog de hidratacion
- URLs bloqueadas y requests que agotaron timeout

El script de validacion transforma esos contadores en metricas comparables:

- tiempo hasta el primer request visible de avatar
- tiempo hasta el primer avatar visible listo en runtime
- tiempo hasta el primer avatar visible pintado
- tiempo hasta 50% y 90% de cobertura pintada visible
- tiempo de settle
- pico de presion de cola visible
- pico de presion in-flight visible
- pico de sources en proxy fallback
- pico de backlog de hidratacion
- pico de brecha runtime-to-paint
- cobertura final pintada

## Comandos

Primera corrida despues de instalar dependencias:

```bash
npx playwright install chromium
```

Validacion en frio, similar a produccion:

```bash
npm run avatar:validate -- --output tmp/avatar-baseline.json
```

Ese comando:

- corre `npm run build`
- levanta `next start` en `http://127.0.0.1:3200`
- abre `/?avatarProbe=1`
- completa el input raiz con el `npub` curado
- samplea el probe hasta que el pipeline quede estable o venza el timeout

Si ya hay un build de produccion levantado, se puede reutilizar:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3200
npm run avatar:validate -- --server-url http://127.0.0.1:3200 --output tmp/avatar-current.json
```

Flags utiles:

- `--root <npub-or-nprofile>` para probar otra identidad
- `--timeout-ms <ms>` para extender la corrida si los relays estan lentos
- `--settle-ms <ms>` para cambiar cuanto espera el script antes de considerar estable el estado pintado
- `--sample-interval-ms <ms>` para samplear mas o menos seguido
- `--headed` para mirar la sesion del navegador
- `--skip-build` si ya se corrio `npm run build` y solo hace falta iniciar el server

## Comparacion antes y despues

Capturar una linea base antes de tocar el pipeline:

```bash
npm run avatar:validate -- --output tmp/avatar-before.json
```

Capturar la version candidata despues del cambio:

```bash
npm run avatar:validate -- --output tmp/avatar-after.json
```

Comparar ambas corridas:

```bash
npm run avatar:compare -- tmp/avatar-before.json tmp/avatar-after.json
```

Para el mismo root y viewport, conviene priorizar estas diferencias:

- `timeToFirstPaintedMs`
- `timeTo90PctPaintedMs`
- `settledAtMs`
- `peakVisibleQueuedRequests`
- `peakVisibleInFlightRequests`
- `peakCriticalVisibleBaseQueuedRequests`
- `peakCriticalVisibleBaseInFlightRequests`
- `maxRuntimePaintGap`
- `maxProxyFallbackSources`
- `maxHydrationBacklog`
- `finalPaintCoverage`

## Chequeos manuales puntuales

Si hace falta inspeccionar el ultimo snapshot crudo durante una corrida en produccion, abrir:

```text
http://127.0.0.1:3200/?avatarProbe=1
```

Luego leer este global del navegador en DevTools:

```js
window.__NOSTR_AVATAR_PIPELINE_PROBE__
```

El probe solo se completa cuando esta presente el query param `avatarProbe=1`, asi que queda acotado a este workflow.
