# Documentación

Qué hay en cada carpeta. Para correr y probar el proyecto, empezá por el [README](../README.md) de la raíz.

| Carpeta o archivo                             | Qué contiene                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [challenge.md](challenge.md)                  | El enunciado, transcripto.                                                                      |
| [adr/](adr/)                                  | Decisiones de base del repositorio (una por archivo): contexto, decisión y consecuencias.       |
| [specs/\_root/](specs/_root/)                 | Una spec por funcionalidad: qué se construye, las reglas, las alternativas y cómo se prueba.    |
| [api/](api/)                                  | Contrato de la API REST `/api/v1`: [empresas](api/company.md) y [operador](api/operator.md).    |
| [ai-usage.md](ai-usage.md)                    | Registro completo de lo que propuso la IA y se corrigió, cambió o descartó, con fecha y motivo. |
| [scope/\_root/scope.md](scope/_root/scope.md) | Plan de trabajo interno: orden de construcción y estado de cada funcionalidad.                  |
| [setup/local.md](setup/local.md)              | Detalle del entorno local.                                                                      |

## Decisiones de base (ADR)

| #                                           | Decisión                                                                                                       | Estado   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| [0001](adr/0001-monorepo-pnpm-turborepo.md) | Monorepo con pnpm workspaces y Turborepo                                                                       | accepted |
| [0002](adr/0002-hexagonal-architecture.md)  | Puertos y adaptadores, controlado con dependency cruiser                                                       | accepted |
| [0003](adr/0003-prisma-multitenancy.md)     | Prisma 7 sobre PostgreSQL; esquema compartido con `tenant_id` y seguridad por fila (ampliada por la spec 0001) | accepted |
| [0004](adr/0004-typescript-6.md)            | TypeScript 6.0 hasta que Next.js soporte TypeScript 7                                                          | accepted |

## Specs

Estados: `Accepted` decidida y verificada, `In Progress` construida y con verificación pendiente, `Assumed` decidida durante la construcción, sin ronda de diseño previa.

| #                                                                     | Funcionalidad                                                                      | Estado      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| [0001](specs/_root/0001-booking-platform-architecture/index.md)       | Arquitectura: una app Next.js, reglas garantizadas por la base, resultados tipados | Accepted    |
| [0002](specs/_root/0002-company-identity-picker.md)                   | Identidad de la empresa: pantalla de ingreso                                       | Assumed     |
| [0003](specs/_root/0003-booking-form-my-bookings/index.md)            | Formulario de reserva y "Mis reservas"                                             | In Progress |
| [0004](specs/_root/0004-operator-administration-and-metrics/index.md) | Administración del operador, sedes y métricas (datos y API)                        | In Progress |
| [0005](specs/_root/0005-operator-administration-screens/index.md)     | Pantallas de administración del operador                                           | In Progress |
| [0006](specs/_root/0006-operator-dashboard/index.md)                  | Tablero del operador                                                               | Assumed     |
| [0007](specs/_root/0007-client-detail-activity/index.md)              | Detalle de un cliente: actividad, métricas y calendario                            | Assumed     |
| [0008](specs/_root/0008-room-availability-screens/index.md)           | Salas, disponibilidad y reserva por horario libre                                  | Assumed     |
| [0009](specs/_root/0009-rooms-matrix/index.md)                        | Matriz semanal de salas en `/salas`                                                | Assumed     |

Las specs y los ADR están en inglés porque son el contexto de trabajo de los agentes de IA; el README y la interfaz están en español.
