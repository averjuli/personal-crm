# deployment-environments Specification

## Purpose
Развёртывание CRM в изолированных prod и staging окружениях на одном сервере.

## ADDED Requirements

### Requirement: Изоляция окружений
Система SHALL запускать prod и staging как отдельные Docker Compose проекты с независимыми `.env`, PostgreSQL volumes, версиями приложения и портами.

#### Scenario: Запуск staging
- **WHEN** staging развёрнут на сервере
- **THEN** его приложение и база используют проект `staging`, отдельный volume и отдельный локальный порт, не затрагивая `prod`

### Requirement: Копирование базы prod
Система SHALL инициализировать staging копией последнего имеющегося prod backup без подключения приложения staging к prod базе.

#### Scenario: Первичная настройка staging
- **WHEN** база staging ещё не создана и выполнена команда инициализации
- **THEN** данные последнего prod backup загружаются только в базу staging

### Requirement: Общий скрипт deploy
Система SHALL использовать один deploy-скрипт и один compose-файл с параметром `prod` или `staging`; staging deployment MUST NOT создавать резервную копию базы, prod deployment MUST создавать её до миграции.

#### Scenario: Два deploy на staging
- **WHEN** два staging deployment запускаются одновременно
- **THEN** одновременно работает не более одного, второй ждёт или завершается без изменения окружения

#### Scenario: Prod deploy
- **WHEN** prod deployment запускается после успешного staging deployment того же SHA
- **THEN** prod делает backup, применяет миграции, запускает этот SHA и проверяет `/health`

### Requirement: Защищённый HTTPS staging
Адрес `https://test-app.vupsen.space` SHALL обслуживаться HTTPS и требовать HTTP Basic Authentication для страниц приложения.

#### Scenario: Доступ к staging
- **WHEN** посетитель открывает staging без корректной пары логин/пароль
- **THEN** nginx не передаёт запрос приложению

### Requirement: Последовательный выпуск
При merge в `main` система SHALL собрать один образ SHA, успешно выкатить и проверить его на staging и затем выкатить тот же SHA в prod. Prod deployment MUST отклонять SHA без успешной выкатки на staging. Deploy staging и prod SHALL выполняться независимо от того, что staging job завершился, чтобы prod pipeline сохранял отдельный результат.

#### Scenario: Staging не прошёл проверку
- **WHEN** staging migration, startup или smoke завершается ошибкой
- **THEN** prod deployment этого SHA не запускается

#### Scenario: Успешный выпуск
- **WHEN** staging smoke завершился успешно
- **THEN** prod deployment запускает тот же SHA
