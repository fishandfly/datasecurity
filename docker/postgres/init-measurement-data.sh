#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=reader_password="$POSTGRES_PASSWORD" --set=ON_ERROR_STOP=1 <<'SQL'
SELECT format('CREATE ROLE measurement_reader LOGIN PASSWORD %L', :'reader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'measurement_reader') \gexec
SELECT format('ALTER ROLE measurement_reader LOGIN PASSWORD %L', :'reader_password') \gexec
SELECT format('CREATE DATABASE measurement_data OWNER %I', current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'measurement_data') \gexec
SQL

psql --username "$POSTGRES_USER" --dbname measurement_data \
  --set=ON_ERROR_STOP=1 --file=/opt/measurement-demo.sql

psql --username "$POSTGRES_USER" --dbname measurement_data \
  --set=ON_ERROR_STOP=1 --file=/opt/measurement-v31.sql

psql --username "$POSTGRES_USER" --dbname measurement_data \
  --set=ON_ERROR_STOP=1 <<'SQL'
GRANT CONNECT ON DATABASE measurement_data TO measurement_reader;
GRANT USAGE ON SCHEMA measurement_demo TO measurement_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA measurement_demo TO measurement_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA measurement_demo GRANT SELECT ON TABLES TO measurement_reader;
ALTER ROLE measurement_reader SET default_transaction_read_only = on;
SQL
