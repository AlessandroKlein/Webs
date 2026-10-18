-- Crea un usuario de base de datos con MÍNIMO PRIVILEGIO para la app en runtime
-- (PostgreSQL). NO es superusuario ni owner: solo CRUD sobre las tablas.
--
-- Las migraciones/esquema (`prisma migrate deploy` / `db push`) deben ejecutarse
-- con una cuenta con privilegios (migrador), NO con esta cuenta de runtime.
--
-- Uso: psql -U postgres -d webs -f create-least-privilege-user.sql

CREATE ROLE webs_app WITH LOGIN PASSWORD 'cambiar-esta-clave-aleatoria';

GRANT CONNECT ON DATABASE webs TO webs_app;
GRANT USAGE ON SCHEMA public TO webs_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO webs_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO webs_app;

-- Para que aplique a tablas futuras creadas por el migrador:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO webs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO webs_app;
