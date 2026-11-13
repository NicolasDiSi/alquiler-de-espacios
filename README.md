# alquiler-de-espacios

Plataforma de reserva de salas de reuniones para empresas clientes, con métricas de utilización para la empresa administradora. Challenge técnico para Fontanella SRL; el enunciado está transcripto en [docs/challenge.md](docs/challenge.md).

> **Aviso:** © 2026 Nicolas Disi. Todos los derechos reservados. Este repositorio se comparte solo para que quien lo recibe evalúe mi postulación. No se permite su uso, copia ni obras derivadas sin mi permiso por escrito. Ver [LICENSE](LICENSE).

## Qué hace

- **Empresas clientes:** ven las salas y su disponibilidad (matriz semanal por sede y calendario por sala), reservan, ven sus reservas y las cancelan. Cada operación fallida dice por qué (sala ocupada, fecha pasada, fuera de horario, rango inválido, no es tuya...).
- **Operador (empresa administradora):** administra sedes, salas, clientes y bloqueos (mantenimiento, feriados, eventos privados), ve todas las reservas y un tablero con ocupación, uso por cliente, mapa de calor por día y hora, franjas de baja ocupación y candidatos a promoción.
- **API REST** documentada en `/api/v1`: [empresas](docs/api/company.md) y [operador](docs/api/operator.md).

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
pnpm dev:app       # solo la app web, cuando la base ya está levantada
```

`pnpm services:down` detiene la base y conserva los datos.

**Ingresar.** Abrí la app y elegí un usuario del seed en `/ingresar` ("ingresar como"): Ana o Bruno (Acme), Carla (Globex), Diego (Initech) u Operador. No hay contraseñas: reemplaza a la autenticación, no lo es. Los miembros de una empresa llegan a sus reservas y el operador a `/operador`. La app no deja ingresar a nadie mientras `SESSION_SECRET` falte, tenga menos de 32 bytes o siga siendo el valor de ejemplo.

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

**Qué prueba lo crítico** (contra PostgreSQL real, no con mocks):

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

## Arquitectura y decisiones

Cada decisión que sostiene el diseño está escrita con sus alternativas en [docs/adr/](docs/adr/) y [docs/specs/](docs/specs/_root/); la base es la [spec 0001](docs/specs/_root/0001-booking-platform-architecture/index.md).

```text
apps/web               Next.js 16: páginas, Server Actions, /api/v1 y la raíz de composición
packages/application   casos de uso y puertos (interfaces)
packages/domain        reglas de negocio puras: validez de una reserva, cancelación, permisos, métricas
packages/db            adaptador PostgreSQL: esquema Prisma, migraciones, seguridad por fila, unidad de trabajo
```

- **Puertos y adaptadores en un monorepo** (pnpm y Turborepo, [ADR 0001](docs/adr/0001-monorepo-pnpm-turborepo.md), [ADR 0002](docs/adr/0002-hexagonal-architecture.md)). Las reglas no conocen Next.js ni Prisma; dependency cruiser rompe el build si una capa importa a otra que no debe. Los casos de uso son la única entrada para escribir.
- **Una sola aplicación desplegable.** Next.js sirve las pantallas (con Server Actions) y una API REST en `/api/v1`. Ambas llaman a los mismos casos de uso y devuelven el mismo resultado tipado. Un servicio aparte, caché o una app de administración separada quedaron para una próxima versión: demasiada infraestructura para una primera versión de 72 horas.
- **La base garantiza las reglas críticas, no el código.** Una restricción de exclusión (`EXCLUDE USING gist` sobre sala y rango de tiempo) impide dos reservas confirmadas superpuestas, aunque lleguen a la vez. Un índice único por sala, fecha y turno no alcanza: deja pasar 10:00 a 12:00 y 11:00 a 13:00.
- **Aislamiento entre empresas dos veces** ([ADR 0003](docs/adr/0003-prisma-multitenancy.md)): seguridad por fila de PostgreSQL con `FORCE` más un filtro de empresa en cada repositorio. Hay tres logins de base: la app (con seguridad por fila), el operador (lee todas las empresas, no escribe reservas) y el dueño del esquema (solo migraciones y seed). La disponibilidad de otras empresas se lee con una función que devuelve solo horarios ocupados, nunca de quién son.
- **Identidad sin autenticación completa.** Usuarios del seed y una cookie firmada con HMAC que incluye su vencimiento. El servidor obtiene la empresa de la cookie, nunca de lo que manda el cliente.
- **Resultados claros.** Cada caso de uso devuelve un resultado tipado con un código de motivo. Cada motivo tiene un status HTTP y un mensaje en español (es-AR), y un test los recorre todos.
- **Crecimiento.** Las sedes son una entidad con su zona horaria, horario y días de apertura; salas y clientes se dan de baja sin borrar su historia, así las métricas siguen siendo correctas. Las métricas de ocupación son cocientes ponderados calculados en la base.
- **Frontend:** React 19 con TypeScript, Tailwind CSS v4, shadcn/ui y next-intl. Las pantallas leen en el servidor solo lo que necesita el servidor (por ejemplo el mes de una sede) y derivan en el navegador lo demás con las mismas funciones del dominio.

## Supuestos

Reglas que el enunciado deja abiertas, decididas en las specs de `docs/specs/`.

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

## Limitaciones conocidas

- **No hay autenticación real.** El selector de ingreso muestra a todos los usuarios del seed y cualquiera puede elegir uno. La cookie firmada evita que se la falsifique, no que se elija a otro usuario.
- **Concurrencia al reservar.** La restricción de exclusión garantiza que nunca se guarden dos reservas superpuestas. La app reserva con `INSERT ... ON CONFLICT DO NOTHING`, que espera a una reserva en curso en lugar de chocar con ella: en carreras de 8 empresas siempre hay un ganador y siete `conflict`. Un `INSERT` simple (alguien que escribiera sin pasar por el caso de uso) puede terminar en deadlock (`40P01`); Postgres aborta a uno sin guardar nada y la app lo responde como `busy` (503, reintentar). `database-guarantees.test.ts` acepta ese resultado y `bookings.test.ts` exige el estricto.
- **Sin claves de idempotencia.** Un reintento que difiera en algo del pedido original puede responder `conflict` aunque la primera reserva se haya guardado.
- **Sin notificaciones.** Cuando una cancelación libera una sala, o un bloqueo choca con reservas existentes, nadie recibe un aviso: la disponibilidad se ve al consultar, y el operador ve la lista de reservas afectadas para contactar a cada cliente.
- **Sin roles dentro de una empresa.** Solo hay miembros y operador; el operador crea los miembros.
- **Bloqueos simples.** No hay bloqueos recurrentes (todos los viernes, una lista anual de feriados) ni restricciones para una sola empresa.
- **Métricas en vivo.** Se calculan en cada consulta; alcanza para el volumen actual, pero no hay instantáneas guardadas.
- **Sin auditoría** de los cambios del operador (quién cambió qué y cuándo).

## Mejoras para una próxima versión

- Autenticación real (por ejemplo OIDC) con un rol de administrador por empresa e invitaciones de miembros.
- Claves de idempotencia guardadas en Postgres para los reintentos.
- Notificaciones: avisar a las empresas afectadas por un bloqueo y, si lo piden, avisar cuando se libere un horario.
- Que el operador pueda reservar o reubicar en nombre de un cliente.
- Bloqueos recurrentes y calendario de feriados por sede.
- Registro de auditoría de los cambios del operador.
- Instantáneas de métricas, solo si medir muestra que las consultas en vivo se vuelven lentas.
- Errores HTTP en formato RFC 9457 y exportación de métricas.
- Si aparece un segundo cliente de la API (por ejemplo una app móvil): un servicio API separado, caché compartida y un pool de conexiones.

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
