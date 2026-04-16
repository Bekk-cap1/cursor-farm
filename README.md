# farm-platform

Исходники приложения **Farm AI**: backend (**FastAPI**), frontend (**React + Vite**), **`docker-compose.yml`** для продакшена.

**Полная инструкция** (Docker, переменные, демо-логин, troubleshooting): [README в корне репозитория](../README.md).

## Кратко

| Задача | Команда |
|--------|---------|
| API локально | `cd backend` → venv → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000` |
| UI локально | `cd frontend` → `npm install` → `npm run dev` |
| Всё в Docker | из **этой** папки: `cp .env.example .env` → `docker compose up -d --build` |

Демо: `demo@example.com` / `demo12345`. Регистрация — с подтверждением по SMS-коду (в демо код в ответе API и в логах).

Заметки и ТЗ: `../ObsidianFarmVault/`.
# cursor-farm
