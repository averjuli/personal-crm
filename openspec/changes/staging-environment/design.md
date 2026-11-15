# Design

## Deployment layout

Один `deploy/compose.yaml` выбирает project name через `crm-deploy <environment> deploy <sha>`. Для prod сохраняются `/opt/personal-crm/.env`, порт 3000 и volume `prod_db-data`. Staging хранит `.env` в `/opt/personal-crm/staging/.env`, свой volume `staging_db-data`, порт 3002 и лимиты памяти. Скрипт проверяет разрешённые значения окружения до вызова Compose.

Один `flock` на окружение сериализует операции и исключает гонку одного окружения; разные lock-файлы позволяют staging и prod идти независимо. Staging deploy пропускает backup; prod сохраняет прежний backup-порядок. Инициализация staging загружает последний `prod-*.sql.gz` только при пустой staging базе. Команды владельца объектов из дампа пропускаются, чтобы staging не зависел от имён ролей prod; созданные объекты принадлежат staging-пользователю базы. Если первичная загрузка упала и оставила пустую базу, следующий deploy повторяет инициализацию.

## Auth and edge

Оба окружения передают собственный `BETTER_AUTH_URL`. Better Auth не получает `cookieDomain`, значит cookies остаются host-only. Nginx добавляет staging virtual host, HTTP Basic Authentication и TLS. Сертификат выпускается certbot для `test-app.vupsen.space`; настройки существующих сайтов не переписываются. Staging deploy проверяет и обновляет upstream только в своём nginx site, проверяет конфигурацию и восстанавливает прежний файл, если проверка или reload не проходят.

## GitHub Actions

Build остаётся общим. Deploy staging запускается после build; deploy prod ожидает успешный staging и проверяет SHA. Для каждого окружения concurrency имеет отдельную группу без отмены текущего запуска. Только prod запускает очистку старых images.

## Data protection

Исходные файлы staging `.env` и nginx credentials не коммитятся. Инициализация staging не выполняется повторно автоматически после появления таблиц. Повторное обновление копии требует отдельной явной команды, которая подтверждает замену только staging базы.
