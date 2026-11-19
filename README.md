# alquiler-de-espacios

Plataforma de reserva de salas de reuniones para empresas clientes, con métricas de utilización para la empresa administradora. Challenge técnico para Fontanella SRL; el enunciado está transcripto en [docs/challenge.md](docs/challenge.md).

> **Aviso:** © 2026 Nicolas Disi. Todos los derechos reservados. Este repositorio se comparte solo para que quien lo recibe evalúe mi postulación. No se permite su uso, copia ni obras derivadas sin mi permiso por escrito. Ver [LICENSE](LICENSE).

## Qué hace

- **Empresas clientes:** ven las salas y su disponibilidad (matriz semanal por sede y calendario por sala), reservan, ven sus reservas y las cancelan. Cada operación fallida dice por qué (sala ocupada, fecha pasada, fuera de horario, rango inválido, no es tuya...).
- **Operador (empresa administradora):** administra sedes, salas, clientes y bloqueos (mantenimiento, feriados, eventos privados), ve todas las reservas y un tablero con ocupación, uso por cliente, mapa de calor por día y hora, franjas de baja ocupación y candidatos a promoción.
- **API REST** en `/api/v1`, 23 rutas documentadas: [empresas](docs/api/company.md) y [operador](docs/api/operator.md). Un test falla si una ruta no autentica o no está documentada.

| Pantalla                                        | Quién    | Qué hace                                                                                                  |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `/ingresar`                                     | todos    | Elegir un usuario del seed ("ingresar como")                                                              |
| `/`                                             | empresa  | Mis reservas: próximas, pasadas y canceladas (buscar, filtrar, paginar) y un calendario; cancelar         |
| `/reservas/nueva`                               | empresa  | Buscar sala libre por día, hora y personas, y reservar                                                    |
| `/salas`, `/salas/[id]`                         | empresa  | Matriz semanal de las salas de una sede, o grilla de tarjetas; calendario de una sala y reservar desde él |
| `/operador`                                     | operador | Tablero: ocupación, uso por cliente, mapa de calor, franjas bajas, candidatos a promoción                 |
| `/operador/reservas`                            | operador | Todas las reservas de todas las sedes: métricas del período, historial filtrable y calendario             |
| `/operador/sedes`, `/operador/sedes/[id]`       | operador | Sedes y salas (alta, edición, baja), actividad de la sede y bloqueos en calendario                        |
| `/operador/clientes`, `/operador/clientes/[id]` | operador | Clientes y miembros (alta, edición, baja, reactivación) y la actividad de cada cliente                    |

Las pantallas escriben con 17 Server Actions (reservar, cancelar, ingresar y salir, y las altas, bajas y bloqueos del operador). Cada una llama al mismo caso de uso que su ruta de la API y devuelve el mismo resultado tipado; no tienen documentación aparte porque no son un contrato público.

## Cómo ejecutarlo

Requiere Docker en ejecución, Node 24 y pnpm.

```bash
pnpm install
cp .env.example .env.local
# En .env.local, reemplazá SESSION_SECRET por una clave propia: openssl rand -hex 32
pnpm dev           # levanta todo y abre la app en http://localhost:3000
```

`pnpm dev` ejecuta estos pasos en orden, así que un solo comando alcanza siempre:

```bash
pnpm services:up   # PostgreSQL 17 en localhost:5432; crea los roles de base la primera vez
pnpm db:deploy     # aplica las migraciones como dueño del esquema
pnpm db:seed       # 1 sede, 3 salas, 3 empresas, sus usuarios, un operador y unas 40 reservas (se puede correr dos veces)
pnpm db:seed:scale # volumen: 3 sedes más, 42 salas, 15 clientes y unas 3000 reservas en ±4 semanas (después de db:seed)
pnpm dev:app       # solo la app web, cuando la base ya está levantada
```

`pnpm services:down` detiene la base y conserva los datos.

**Ingresar.** Abrí la app y elegí un usuario del seed en `/ingresar` ("ingresar como"): Ana o Bruno (Acme), Carla (Globex), Diego (Initech) u Operador; con el seed de volumen aparecen también los miembros de los otros 12 clientes. No hay contraseñas: reemplaza a la autenticación, no lo es. Los miembros de una empresa llegan a sus reservas y el operador a `/operador`. La app no deja ingresar a nadie mientras `SESSION_SECRET` falte, tenga menos de 32 bytes o siga siendo el valor de ejemplo.

> **Si cambian los roles de la base** (`infra/local/postgres/`), recreá la base local una vez con `docker compose down -v` y repetí los pasos. Postgres corre esos scripts solo con un volumen nuevo. Esto borra los datos locales.

Prisma Studio (`pnpm db:studio`) se conecta como dueño del esquema y la seguridad por fila también lo alcanza, así que no muestra reservas. Para ver todas las empresas en modo lectura: `DATABASE_OWNER_URL=postgresql://espacios_operator:espacios_operator@localhost:5432/espacios pnpm db:studio`.

## Cómo probarlo

Los tests levantan su propio PostgreSQL descartable con testcontainers, así que Docker tiene que estar en ejecución. No usan la base de `pnpm dev`.

```bash
pnpm test                       # unitarios e integración (Vitest) en todos los paquetes
pnpm check:ai                   # todas las verificaciones, una línea PASS/FAIL por cada una
pnpm check:ai --gate=test       # una sola: biome, strings, typecheck, boundaries, knip, test, e2e
```

Las pruebas de punta a punta (Playwright con axe) compilan la app y la corren con `next start` contra una base nueva con el seed:

```bash
pnpm --filter @espacios/web exec playwright install --with-deps chromium   # la primera vez
pnpm check:ai --gate=e2e                    # todas
pnpm check:ai --gate=e2e --suite=bookings   # una área: bookings, shell u operator
```

**Cada tipo de test tiene un propósito:**

| Tipo          | Dónde                                                                           | Para qué                                                                                         |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unitario      | `packages/domain`, `packages/application`                                       | Las reglas y los casos de uso, con puertos falsos: rápidos, sin base                             |
| Integración   | `packages/db`                                                                   | Lo que solo garantiza PostgreSQL: la exclusión, la RLS, los permisos, las carreras, las métricas |
| Contrato      | `apps/web/src/app/api/v1/*.test.ts`, `apps/web/src/lib/result/contract.test.ts` | La API: que cada ruta autentique, el status de cada motivo y que esté documentada                |
| Punta a punta | `apps/web/e2e/*.spec.ts`                                                        | Los flujos de usuario en el navegador, con axe para la accesibilidad                             |

**Dónde se prueba lo crítico** (lo que depende de la base, contra PostgreSQL real, no con mocks):

| Comportamiento                              | Dónde                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin superposición bajo concurrencia         | `packages/db/src/bookings.test.ts` (8 empresas compiten por el mismo turno: un ganador, siete `conflict`), `database-guarantees.test.ts` (la restricción sola) |
| Cancelar libera el turno                    | `packages/db/src/cancel.test.ts`                                                                                                                               |
| Aislamiento entre empresas                  | `packages/db/src/roles.test.ts`, `bookings.test.ts` (seguridad por fila, filtro del repositorio), `handlers.test.ts` (el id de empresa del body se ignora)     |
| Persistencia tras reiniciar app y base      | `packages/db/src/persistence.test.ts`                                                                                                                          |
| Reglas de reserva y motivo de cada rechazo  | `packages/domain/src/booking/*.test.ts`, `packages/application/src/use-cases/*.test.ts`                                                                        |
| Métricas                                    | `packages/db/src/operator-metrics.test.ts`, `packages/domain/src/metrics/*.test.ts`                                                                            |
| Contrato HTTP (autenticación, status, docs) | `apps/web/src/app/api/v1/routes.test.ts`, `handlers.test.ts`                                                                                                   |
| Flujos de usuario y accesibilidad           | `apps/web/e2e/*.spec.ts`                                                                                                                                       |

Las carreras verifican el resultado de cada participante a la vez, así un fallo muestra por qué perdió cada uno. Cobertura mínima exigida: `domain` 90%, `application` 85%, el resto 70%.

## Supuestos

Reglas que el enunciado deja abiertas, decididas en las specs de `docs/specs/`. Las specs 0002 y 0006 a 0009 las decidí durante la construcción.

**Reservas**

- Grilla de 30 minutos; una reserva dura de 30 minutos a 4 horas, empieza y termina el mismo día local, dentro del horario de su sede, y como máximo 60 días adelante.
- Cada sede define su zona horaria, horario y días de apertura. La sede del seed: lunes a viernes de 08:00 a 20:00, `America/Argentina/Buenos_Aires`. Las fechas se guardan en UTC y se validan y muestran en la zona de la sede.
- Cualquier miembro de la empresa puede cancelar una reserva de su empresa, en cualquier momento antes del inicio. Para otra empresa, la reserva no existe.
- Repetir exactamente la misma reserva (misma empresa, sala y horario) devuelve la existente en lugar de un error, para cubrir el doble clic.
- Todo usuario pertenece a una empresa cliente o es el operador. Una persona que trabaja sola es un cliente de tipo `individual` con un miembro, así el aislamiento sigue siendo una sola regla.
- El operador no reserva ni cancela en nombre de un cliente. Solo los miembros escriben reservas.

**Administración**

- Salas, sedes y empresas se desactivan, nunca se borran. Una sala o sede desactivada no se reactiva (se crea una nueva); una empresa sí.
- Los bloqueos (mantenimiento, feriados, eventos privados) cubren una sala o una sede entera. No se editan, solo se liberan, y las empresas los ven solo como "no disponible". Un bloqueo no se superpone con otro bloqueo activo de la misma sala o de toda la sede.

**Métricas**

- Cuentan solo las reservas confirmadas. Ocupación = minutos reservados sobre minutos abiertos dentro del período activo de la sala, sin el tiempo bloqueado. La ocupación de una sede y la total son un cociente ponderado, nunca un promedio de porcentajes.
- Un rango de métricas es de 366 días como máximo; cada día se lee en la zona horaria de su sede.
- Una empresa es candidata a promoción si no tiene reservas confirmadas en el rango, si su tiempo reservado está por debajo del 25% del promedio de las empresas activas (con al menos 3) o si su tasa de cancelación es 0,3 o más sobre al menos 5 reservas.
- Las franjas de baja ocupación son las celdas del mapa de calor por debajo del 20% (ajustable), de la más vacía a la menos, como máximo 20.
- `lastBookingAt` es la última vez que la empresa hizo una reserva confirmada, sin importar el rango.
- El tablero lee los últimos 7, 30 o 90 días completos, hasta ayer en Buenos Aires, y compara cada cifra con el mismo número de días anteriores. El gráfico diario cubre siempre 90 días. Una sala tiene alta demanda desde el 80% de ocupación y baja demanda por debajo del 20%. Un valor que no se puede medir se muestra como un guion, nunca como 0%.

## Arquitectura y decisiones

Cada decisión está escrita con su contexto y sus alternativas en `docs/` (índice en [docs/README.md](docs/README.md)). La base es la [spec 0001](docs/specs/_root/0001-booking-platform-architecture/index.md).

```mermaid
flowchart LR
    subgraph web["apps/web (Next.js 16)"]
        ui["Páginas y Server Actions"]
        api["API REST /api/v1"]
        comp["composition/index.ts"]
    end
    app["packages/application<br/>casos de uso y puertos"]
    dom["packages/domain<br/>reglas puras"]
    db["packages/db<br/>adaptador Prisma"]
    pg[("PostgreSQL 17<br/>exclusión, RLS, triggers")]

    ui --> app
    api --> app
    app --> dom
    comp -. conecta .-> db
    db -. implementa los puertos .-> app
    db --> pg
```

El modelo de datos ([`schema.prisma`](packages/db/prisma/schema.prisma); las restricciones, la seguridad por fila y los triggers están en [`migrations/`](packages/db/prisma/migrations/)):

```mermaid
erDiagram
    FACILITY ||--o{ ROOM : tiene
    FACILITY ||--o{ BLOCK : tiene
    ROOM |o--o{ BLOCK : "bloquea (vacío: toda la sede)"
    COMPANY ||--o{ APP_USER : "miembros (el operador no tiene empresa)"
    COMPANY ||--o{ BOOKING : "tenant_id, RLS"
    ROOM ||--o{ BOOKING : "sin superposición (exclusión)"
    APP_USER ||--o{ BOOKING : reserva
    APP_USER ||--o{ BLOCK : crea

    FACILITY {
        text time_zone
        int opens_at
        int closes_at
        smallint_array open_weekdays
    }
    ROOM {
        int capacity
        timestamptz active_from
        timestamptz deactivated_at
    }
    COMPANY {
        text slug
        enum kind
        timestamptz deactivated_at
    }
    APP_USER {
        enum role
    }
    BOOKING {
        timestamptz starts_at
        timestamptz ends_at
        enum status
    }
    BLOCK {
        timestamptz starts_at
        timestamptz ends_at
        timestamptz released_at
    }
```

**El backend es Node.js + TypeScript.** Los casos de uso (`packages/application`), las reglas (`packages/domain`) y el adaptador PostgreSQL (`packages/db`) son TypeScript sobre Node 24 y no dependen de Next.js; dependency cruiser lo hace cumplir. Next.js solo los expone, por Server Actions y por la API REST `/api/v1`, y todo el servidor corre en el runtime de Node, no en Edge. Pasarlos a un servicio aparte cambia el adaptador HTTP, no las reglas.

| Decisión                                                                                                                 | Alternativa descartada                                                        | Por qué                                                                                              | Dónde                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Puertos y adaptadores en un monorepo; dependency cruiser rompe el build si una capa importa a otra que no debe           | Capas por convención, sin control                                             | Las reglas no conocen Next.js ni Prisma y se prueban solas                                           | [ADR 0001](docs/adr/0001-monorepo-pnpm-turborepo.md), [ADR 0002](docs/adr/0002-hexagonal-architecture.md) |
| Una sola app Next.js: pantallas con Server Actions y API REST en `/api/v1`, sobre los mismos casos de uso                | Servicio API aparte (Hono), app de administración, caché y pool de conexiones | Demasiada infraestructura para una primera versión de 72 horas; queda en "próxima versión"           | [Spec 0001](docs/specs/_root/0001-booking-platform-architecture/index.md)                                 |
| Superposición impedida por una restricción de exclusión en PostgreSQL (sala y rango de tiempo)                           | Validar en el código, o un índice único por sala, fecha y turno               | El código no ve las transacciones concurrentes; el índice deja pasar 10:00 a 12:00 con 11:00 a 13:00 | Spec 0001                                                                                                 |
| Aislamiento doble: seguridad por fila con `FORCE` más filtro de empresa en cada repositorio                              | Solo filtro en el código                                                      | Un filtro olvidado no expone datos: la base devuelve cero filas                                      | [ADR 0003](docs/adr/0003-prisma-multitenancy.md), spec 0001                                               |
| Tres logins de base: la app, el operador (lee todo, no escribe reservas) y el dueño del esquema                          | El operador con el login del dueño                                            | El dueño puede escribir y cambiar el esquema; el operador recibe el mínimo permiso                   | Spec 0001                                                                                                 |
| Disponibilidad ajena por una función que devuelve solo horarios ocupados                                                 | Seguridad por fila también en las salas                                       | La empresa ve que una sala está tomada sin saber por quién                                           | Spec 0001                                                                                                 |
| Identidad con usuarios del seed y una cookie HMAC con vencimiento firmado                                                | Autenticación completa, o el id de empresa enviado por el cliente             | El enunciado no pide autenticación, pero la empresa tiene que salir del servidor                     | [Spec 0002](docs/specs/_root/0002-company-identity-picker.md)                                             |
| Resultado tipado con un código por motivo, mapeado una vez a HTTP y a un mensaje en español                              | Excepciones y mensajes armados en cada pantalla                               | La pantalla y la API explican igual cada fallo, y un test recorre todos los motivos                  | Spec 0001                                                                                                 |
| Sin claves de idempotencia: repetir la misma reserva devuelve la existente                                               | Tabla de claves de idempotencia                                               | Cubre el doble clic sin otra tabla; las claves quedan para clientes externos                         | Spec 0001                                                                                                 |
| Sedes con zona horaria y horario propios; salas y clientes se desactivan, no se borran                                   | Horario fijo global, borrado físico                                           | Crecer en sedes sin cambiar reglas, y métricas correctas sobre la historia                           | [Spec 0004](docs/specs/_root/0004-operator-administration-and-metrics/index.md)                           |
| Métricas en SQL en vivo, como cocientes ponderados; los umbrales son reglas del dominio                                  | Promedio de porcentajes, o tablas de resumen                                  | El promedio engaña con salas de distinto uso; con este volumen no hace falta guardar resúmenes       | Spec 0004, [spec 0006](docs/specs/_root/0006-operator-dashboard/index.md)                                 |
| Las pantallas piden al servidor solo el mes de una sede y derivan lo demás en el navegador con las funciones del dominio | Volver al servidor en cada clic                                               | Menos consultas y la misma regla en servidor y cliente                                               | [Spec 0008](docs/specs/_root/0008-room-availability-screens/index.md)                                     |

## Limitaciones conocidas

- **No hay autenticación real.** El selector de ingreso muestra a todos los usuarios del seed y cualquiera puede elegir uno. La cookie firmada evita que se la falsifique, no que se elija a otro usuario.
- **Concurrencia al reservar.** La restricción de exclusión garantiza que nunca se guarden dos reservas superpuestas. La app reserva con `INSERT ... ON CONFLICT DO NOTHING`, que espera a una reserva en curso en lugar de chocar con ella: en carreras de 8 empresas siempre hay un ganador y siete `conflict`. Un `INSERT` simple (alguien que escribiera sin pasar por el caso de uso) puede terminar en deadlock (`40P01`); Postgres aborta a uno sin guardar nada y la app lo responde como `busy` (503, reintentar). `database-guarantees.test.ts` acepta ese resultado y `bookings.test.ts` exige el estricto.
- **Sin claves de idempotencia.** Un reintento que difiera en algo del pedido original puede responder `conflict` aunque la primera reserva se haya guardado.
- **Sin notificaciones.** Cuando una cancelación libera una sala, o un bloqueo choca con reservas existentes, nadie recibe un aviso: la disponibilidad se ve al consultar, y el operador ve la lista de reservas afectadas para contactar a cada cliente.
- **Sin roles dentro de una empresa.** Solo hay miembros y operador; el operador crea los miembros.
- **Bloqueos simples.** No hay bloqueos recurrentes (todos los viernes, una lista anual de feriados) ni restricciones para una sola empresa.
- **Métricas en vivo.** Se calculan en cada consulta; alcanza para el volumen actual, pero no hay instantáneas guardadas.
- **Sin auditoría** de los cambios del operador (quién cambió qué y cuándo).
- **Sin e2e en dos pantallas del operador** (`/operador/reservas` y `/operador/clientes/[id]`): sus datos están probados contra Postgres, pero las pantallas van a cambiar mucho cuando crezca la app.

## Mejoras y crecimiento

**Lo que ya soporta el modelo sin cambios.** Más sedes (cada una con su zona horaria, horario y días), más salas y más clientes se cargan desde las pantallas del operador. Salas, sedes y clientes se desactivan sin perder su historia, y las métricas ya cuentan salas que entran o salen a mitad de un período.

**Próxima versión (producto):**

- Autenticación real (por ejemplo OIDC), con un rol de administrador por empresa e invitaciones de miembros.
- Notificaciones: avisar a las empresas afectadas por un bloqueo y a quien espera un horario que se libera (lista de espera con una tabla de eventos de salida, _outbox_).
- Que el operador pueda reservar o reubicar en nombre de un cliente.
- Bloqueos recurrentes y calendario de feriados por sede; reservas periódicas (todas las semanas).
- Registro de auditoría de los cambios del operador.
- Claves de idempotencia guardadas en Postgres para clientes externos que reintentan, y errores en formato RFC 9457.

**Crecimiento comercial** (lo que el enunciado pide para promociones y ocupación):

- Tarifa por hora de cada sala y el precio guardado en cada reserva, para medir ingresos además de horas.
- Promociones con descuento, vigencia, días y horas, dirigidas a las franjas bajas del mapa de calor, y la reserva enlazada a la promoción para medir si funcionó.
- Asistentes por reserva (una sala de 16 reservada para 2) y registro de asistencia para comparar uso real con uso reservado.
- Planes por cliente con horas incluidas por mes.

**Escala** (solo cuando se mida la necesidad):

- Resúmenes diarios de uso guardados si las métricas en vivo se vuelven lentas.
- Un servicio API separado, caché compartida y un pool de conexiones si aparece un segundo cliente de la API (por ejemplo una app móvil).
- El [plan inicial](docs/specs/_root/0001-booking-platform-architecture/rationale.md#option-2-the-first-plan-nextjs-bffs-a-hono-service-with-two-pools-separate-admin-app-pgbouncer-valkey-idempotency-keys-capability-flags) describe esa arquitectura completa, pensada para un equipo más grande y para producción: un servicio Hono dueño de la base con un pool por empresa y otro de administración, una app de administración desplegada aparte, PgBouncer, Valkey, claves de idempotencia y _flags_ por empresa. Quedó descartado para esta versión por costo, no por estar mal. Al adoptarlo, la empresa tiene que viajar en un token firmado por usuario y no en un encabezado `X-Tenant-Id` con un token compartido, que cualquiera que lo tenga puede falsificar.
- Un nivel de organización por encima de la sede si el producto pasa a servir a varios operadores.

## Uso de IA

**Herramientas.** Claude Code (modelo Claude Opus) con skills del proyecto que ordenan el trabajo: `/scope`, `/architect`, `/develop`, `/test`, `/check`, `/debug`, `/document`, `/sync`.

**Qué delegué.** Preparar el entorno de agentes (skills, verificaciones, hooks); redactar specs y decisiones a partir de entrevistas con preguntas y alternativas; implementar cada parte desde una spec aprobada; escribir tests; y revisar con un agente nuevo, que no escribió el código, para que no herede sus supuestos. Yo decidí cada spec y revisé cada cambio; las verificaciones automáticas (tipos, límites entre capas, tests contra PostgreSQL real) frenan lo que se escape.

**Qué corregí, cambié o descarté** (algunos ejemplos; el registro completo, con fecha y motivo, está en [docs/ai-usage.md](docs/ai-usage.md)):

- **Arquitectura sobredimensionada.** Un plan propuso un servicio Hono aparte, una app de administración, PgBouncer, Valkey y claves de idempotencia. Lo reduje a una app Next.js con roles de base; el resto quedó en "próxima versión".
- **Guardia de superposición incorrecta.** El plan usaba un índice único por sala, fecha y turno, que deja pasar 10:00 a 12:00 y 11:00 a 13:00. Lo reemplacé por una restricción de exclusión sobre el rango de tiempo.
- **Seguridad por fila en todas las tablas.** Las salas quedan compartidas, y la disponibilidad pasa por una función que devuelve solo horarios ocupados; si no, una empresa no podría ver que una sala está tomada.
- **El operador con el login del dueño del esquema.** Lo cambié por un login de solo lectura sobre los datos de las empresas, con `FORCE`, porque el dueño también puede escribir y cambiar el esquema.
- **Cookie sin vencimiento firmado.** La spec ponía `userId.firma`; solo el navegador aplica `maxAge`, así que una cookie copiada valía para siempre. Ahora el vencimiento va firmado y se verifica en el servidor.
- **Bloqueos superpuestos.** La spec los permitía y el agente lo testeó a propósito; en el calendario aparecían dos bloqueos idénticos. Ahora se rechazan bajo un lock de la sede, con una carrera de seis bloqueos y un solo ganador como prueba.
- **Un test de concurrencia que exigía un único código de error.** Un sondeo de 80 rondas mostró que dos `INSERT` simples a veces terminan en deadlock en lugar de `23P01`. La garantía es lo que queda guardado (una fila), no qué error recibe el que pierde, así que el test de la restricción acepta ambos y el del caso de uso sigue siendo estricto.
- **Detalles de interfaz que el agente daba por buenos.** Colores fuera del tema, opciones de FullCalendar 6 que la versión 7 ignora sin error de tipos y un calendario hecho a mano en lugar del componente compartido. Los corregí con pruebas de contraste en Playwright y reutilizando los componentes de mi plantilla.
