-- pg_net не умеет ALTER EXTENSION SET SCHEMA: пересоздаём в extensions. Функции остаются в схеме net.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
