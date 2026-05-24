# Карта России — Атлас исторических границ

Интерактивный исторический атлас России, **862–2020**. На 3D-спутниковом глобусе
отображаются границы страны, города и историческая справка, которые меняются по
мере перемотки шкалы времени. Интерфейс и контент — на русском языке.

![Глобус — 1613 год](screenshots/hero.png)

## Возможности

- **Яркий спутниковый глобус** (NASA Blue Marble + рельеф) с тёплым свечением
  атмосферы, вращением мышью и зумом.
- **Точные исторические границы** для 21 эпохи — яркими контурами в цвете
  легенды, поверх бледной белой сетки современных границ государств.
- **Города** — метки-спрайты, жёстко привязанные к поверхности (кириллические
  подписи, скрываются на обратной стороне при вращении).
- **Шкала времени** с воспроизведением, выбором скорости, метками эпох и
  горячими клавишами (Пробел — пауза/пуск, ←/→ — шаг, Shift+←/→ — ±10 лет,
  Home/End).
- Заставка с «погружением» в глобус.

## Запуск локально

**Сборка и пакетный менеджер не нужны** — всё подгружается с CDN, а JSX
компилируется в браузере с помощью Babel. Нужен только статический HTTP-сервер.

```sh
cd "History (1)"
python -m http.server 8000
# открыть http://localhost:8000
```

**Нельзя** открывать `index.html` через `file://` — файлы
`<script type="text/babel" src=…>` загружаются по сети, а `file://` это блокирует
(CORS). Нужен статический HTTP-сервер. **Браузеру клиента нужен интернет**
(React, Babel, three.js, globe.gl, world-atlas и текстуры Земли грузятся с unpkg).
Исторические границы вшиты в `borders-data.js`, поэтому они работают офлайн.

## Структура проекта

| Файл | Назначение |
|------|------------|
| `index.html` | Подключает все скрипты/стили (порядок важен); сброс кэша через `?v=N`. |
| `data.js` | `PERIODS`, `CITIES`, `YEAR_MIN/MAX` — источник истины для контента. |
| `borders-data.js` | `window.HISTORICAL_BORDERS` — реальный GeoJSON границы по эпохам. |
| `globe-map-v2.jsx` | `Globe3DMap` — 3D-глобус (спутниковая текстура, границы, спрайты городов). |
| `app.jsx` | `App` — HUD, шкала времени, воспроизведение, переход заставка→карта. |
| `landing.jsx` | Заставка (hero-экран). |
| `tweaks-panel.jsx` | Переиспользуемая панель настроек и контролы. |
| `styles.css`, `redesign.css` | Базовые стили + тёплый редизайн «рассвет». |

Импортов/экспортов нет — скрипты делят одну глобальную область видимости, и
**порядок загрузки в `index.html` важен**: `data.js → borders-data.js →
tweaks-panel → landing → globe-map-v2 → app`. После правки файла увеличивайте его
`?v=N`, чтобы браузер перезагрузил его.

### Правка контента

Меняйте `data.js`, чтобы изменить эпохи, города и справки. Каждый период —
`{ year, title, subtitle, body, territories[] }`; `findPeriod(year)` привязывает
шкалу к последней эпохе, у которой `year <= текущий`.

### Правка границ

`borders-data.js` сопоставляет `period.year → GeoJSON` (Polygon/MultiPolygon,
WGS84 lon/lat). Чтобы переопределить границу эпохи, замените её запись своим
GeoJSON.

## Источники данных и благодарности

- **Исторические границы:** [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)
  — © участники проекта, лицензия **CC-BY-SA 4.0**. Полигон России для каждой
  эпохи извлечён и упрощён в `borders-data.js`.
- **Современные границы:** [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain).
- **Снимки Земли:** NASA Blue Marble (через примеры ассетов three-globe).
- **Библиотеки:** React, Babel standalone, three.js, globe.gl, topojson-client,
  polygon-clipping — все с unpkg.

## Развёртывание на своём сервере (доступ по IP)

Приложение полностью статическое, поэтому «развернуть» = раздать папку по HTTP на
порту, открытом в фаерволе.

1. **Скопируйте папку** на сервер и (рекомендуется) переименуйте без пробелов:
   ```sh
   scp -r "History (1)" user@SERVER_IP:/var/www/atlas
   ```
2. **Откройте порт** в фаерволе (и в security group облака, если есть):
   ```sh
   sudo ufw allow 8080/tcp
   ```
3. **Раздайте.** Быстрая проверка:
   ```sh
   cd /var/www/atlas
   python3 -m http.server 8080 --bind 0.0.0.0
   # открыть http://SERVER_IP:8080
   ```
   Постоянно (переживает выход из сессии и перезагрузку) — через **systemd**,
   создайте `/etc/systemd/system/atlas.service`:
   ```ini
   [Unit]
   Description=Russia Atlas (static)
   After=network.target
   [Service]
   WorkingDirectory=/var/www/atlas
   ExecStart=/usr/bin/python3 -m http.server 8080 --bind 0.0.0.0
   Restart=always
   [Install]
   WantedBy=multi-user.target
   ```
   ```sh
   sudo systemctl enable --now atlas
   ```
   Или через **nginx** на порту 80 — `/etc/nginx/sites-available/atlas`:
   ```nginx
   server {
     listen 80 default_server;
     root /var/www/atlas;
     index index.html;
   }
   ```
   ```sh
   sudo ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   # открыть http://SERVER_IP
   ```

**Замечания**
- Клиентам всё равно нужен интернет (библиотеки с CDN + спутниковая текстура).
- Раздавайте по HTTP, никогда через `file://`.
- Если оставить имя папки `History (1)`, URL придётся кодировать
  (`History%20(1)`) — переименование в `atlas` избавляет от этого.
