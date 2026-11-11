# Entorno local

Todo corre en tu máquina con Docker.

## Requisitos

| Herramienta | Versión                                | Para qué                                                   |
| ----------- | -------------------------------------- | ---------------------------------------------------------- |
| Node.js     | 24 (ver `.nvmrc`)                      | App, scripts y tests                                       |
| pnpm        | 12 (`corepack enable`)                 | Monorepo                                                   |
| Docker      | Docker Desktop o Engine con Compose v2 | Postgres local y los tests de integración (testcontainers) |

## Primer arranque

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm services:up      # Postgres 17 en localhost:5432
pnpm db:deploy        # aplica las migraciones
pnpm dev              # http://localhost:3000
pnpm db:studio        # panel de datos en http://localhost:5555
```

## Conexiones a la base

| Variable             | Rol                                          | Uso                                                                                                                     |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | `espacios_app`, del grupo `espacios_runtime` | La app en ejecución. No es dueño de las tablas, así que RLS siempre aplica: solo ve la empresa que fijó la transacción. |
| `DATABASE_OWNER_URL` | `espacios`, dueño del esquema                | Migraciones, Prisma Studio y las lecturas de la administradora que cruzan empresas (métricas).                          |

Prisma Studio usa la conexión owner, así que muestra los datos de **todas** las empresas.

## Cambiar el esquema

1. Editar `packages/db/prisma/schema.prisma`.
2. Crear la migración con `pnpm db:migrate --name <cambio>`.
3. Si la tabla nueva pertenece a una empresa, agregarle RLS, permisos para `espacios_runtime` y un test de aislamiento. La guía es la skill `multi-tenant-safety`.

## Tests

`pnpm test` levanta su propio Postgres descartable con testcontainers y no toca la base de `compose.yaml`. Solo necesita que Docker esté corriendo.
