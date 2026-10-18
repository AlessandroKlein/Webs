.PHONY: up down logs ps reset

## Arranca toda la plataforma (PostgreSQL, MySQL, Redis, API y web).
## Luego abrí http://localhost:5173.
up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

## Reinicia desde cero (borra volúmenes de datos).
reset:
	docker compose down -v
	docker compose up -d --build
