# Proposal

## Why

Нужен защищённый тестовый адрес для проверки релизов на копии рабочих данных до их выпуска в прод. Сейчас приложение, база, адрес входа и выкладка настроены только для prod.

## What Changes

- Добавить отдельный staging compose-проект, базу, файл окружения и ограничения памяти контейнеров.
- Использовать один deploy-скрипт для prod и staging с параметром окружения; резервную копию перед выкаткой делать только для prod.
- Копировать данные prod из последнего backup при первичной настройке staging и при ручном обновлении копии.
- Разделить адреса magic link и область cookie между поддоменами.
- Добавить защищённый паролем HTTPS адрес тест-стенда и последовательную выкатку staging.
- Выкатывать один SHA в staging, а затем в prod; prod deployment должен требовать успешную выкатку этого SHA на staging.

## Capabilities

### New Capabilities
- `deployment-environments`: Разделённые окружения prod и staging с независимыми базами и последовательными выкладками.

### Modified Capabilities
- `user-auth`: Magic link и session cookie должны работать только в том окружении и поддомене, где начат вход.

## Impact

`src/lib/auth.ts`, `deploy/compose.yaml`, `deploy/crm-deploy.sh`, `deploy/install-on-server.sh`, `.github/workflows/deploy.yml`, `.env.example`, README и конфигурация nginx на сервере.
