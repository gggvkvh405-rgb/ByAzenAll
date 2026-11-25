import { iconNodes } from "./icon-nodes.js";
import { apps, categories, getApp } from "./data/apps.js";
import "./styles.css";

const root = document.querySelector("#app");
const FAVORITES_KEY = "byazen:favorites:v1";
const RECENTS_KEY = "byazen:recents:v1";
const TASKS_KEY = "byazen:demo-tasks:v1";
const NOTES_KEY = "byazen:note:126:v1";

function readStore(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing may disable storage */ }
}

const storedFavorites = readStore(FAVORITES_KEY, []);
const storedRecents = readStore(RECENTS_KEY, []);
const defaultTasks = ["Собрать список файлов", "Проверить заметки", "Подготовить рабочий стол"];
const storedTasks = readStore(TASKS_KEY, defaultTasks);
const state = {
  mode: "all",
  categoryId: null,
  activeAppId: null,
  returnView: null,
  contextAppId: null,
  contextPosition: null,
  infoAppId: null,
  query: "",
  sort: "default",
  layout: "grid",
  favorites: new Set(Array.isArray(storedFavorites) ? storedFavorites.map(Number) : []),
  recents: Array.isArray(storedRecents) ? storedRecents.map(Number).filter((id) => getApp(id)) : [],
  demoCounter: 0,
  scanRunning: false,
  pomodoro: { remaining: 25 * 60, running: false, interval: null },
  taskRows: (Array.isArray(storedTasks) ? storedTasks : defaultTasks).slice(0, 8),
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function renderIcon(name, size = 18, className = "") {
  const node = iconNodes[name] || iconNodes.Square;
  const renderChild = ([tag, attributes = {}, children]) => {
    const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(" ");
    if (children?.length) return `<${tag} ${attrs}>${children.map(renderChild).join("")}</${tag}>`;
    return `<${tag} ${attrs} />`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" class="icon ${escapeHtml(className)}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${node.map(renderChild).join("")}</svg>`;
}

function appById(id) { return getApp(id); }
function isFavorite(id) { return state.favorites.has(Number(id)); }
function currentApp() { return appById(state.activeAppId); }
function normalized(value) { return String(value ?? "").toLocaleLowerCase("ru").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function sidebarMarkup() {
  const favoritesCount = state.favorites.size;
  const recentCount = state.recents.length;
  return `
    <aside class="sidebar" aria-label="Основная навигация">
      <button class="brand-lockup" type="button" data-action="home" aria-label="ByAzen — на главную">
        <span class="brand-symbol">${renderIcon("Asterisk", 22)}</span>
        <span><span class="brand-title">ByAzen</span><span class="brand-caption">DESKTOP SUITE</span></span>
      </button>
      <div class="sidebar-scroll">
        <div class="sidebar-label">Рабочее пространство</div>
        <nav class="sidebar-nav" aria-label="Библиотека">
          <button class="nav-item ${state.mode === "all" && !state.categoryId && !state.activeAppId ? "active" : ""}" data-action="show-mode" data-mode="all" title="Все приложения">
            ${renderIcon("PanelsTopLeft", 17)}<span>Все приложения</span><span class="nav-count">185</span>
          </button>
          <button class="nav-item ${state.mode === "favorites" ? "active" : ""}" data-action="show-mode" data-mode="favorites" title="Избранное">
            ${renderIcon("Star", 17)}<span>Избранное</span><span class="nav-count">${favoritesCount}</span>
          </button>
          <button class="nav-item ${state.mode === "recent" ? "active" : ""}" data-action="show-mode" data-mode="recent" title="Недавно открытые">
            ${renderIcon("History", 17)}<span>Недавно открытые</span><span class="nav-count">${recentCount}</span>
          </button>
        </nav>
        <div class="sidebar-label">14 направлений</div>
        <nav class="category-list" aria-label="Категории">
          ${categories.map((category) => `
            <button class="category-item ${state.mode === "category" && state.categoryId === category.id ? "active" : ""}" data-action="show-category" data-category="${category.id}" title="${escapeHtml(category.name)}">
              ${renderIcon(category.icon, 15)}<span>${escapeHtml(category.short)}</span><span class="category-count">${category.count}</span>
            </button>
          `).join("")}
        </nav>
      </div>
      <div class="sidebar-bottom">
        <div class="local-status"><span class="status-orb"></span><div><strong>Локальное пространство</strong><small>макет без подключения к системе</small></div></div>
        <div class="sidebar-version">BYAZEN SUITE&nbsp; · &nbsp;185 МОДУЛЕЙ</div>
      </div>
    </aside>
  `;
}

function topbarMarkup() {
  const app = currentApp();
  const breadcrumb = app ? app.title : state.mode === "favorites" ? "Избранное" : state.mode === "recent" ? "Недавно открытые" : state.mode === "category" ? categories.find((item) => item.id === state.categoryId)?.short ?? "Категория" : "Все приложения";
  return `
    <header class="main-topbar">
      <div class="breadcrumbs">${renderIcon("Grid2X2", 14)}<span>Рабочее пространство</span><span>/</span><span class="breadcrumb-current">${escapeHtml(breadcrumb)}</span></div>
      <div class="topbar-tools">
        <label class="search-control" for="global-search">
          ${renderIcon("Search", 17)}
          <input id="global-search" type="search" data-global-search autocomplete="off" spellcheck="false" value="${escapeHtml(state.query)}" placeholder="Найти приложение…" aria-label="Поиск по приложениям" />
          <span class="search-shortcut"><kbd>⌘</kbd><kbd>K</kbd></span>
        </label>
      </div>
    </header>
  `;
}

function getVisibleApps() {
  let visible = [...apps];
  if (state.mode === "favorites") visible = visible.filter((app) => isFavorite(app.id));
  if (state.mode === "recent") visible = state.recents.map(appById).filter(Boolean);
  if (state.mode === "category") visible = visible.filter((app) => app.categoryId === state.categoryId);
  if (state.query.trim()) {
    const query = normalized(state.query.trim());
    visible = visible.filter((app) => normalized(`${app.brand} ${app.title} ${app.description} ${app.category} ${app.stack} ${app.id}`).includes(query));
  }
  if (state.sort === "az") visible.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  if (state.sort === "id") visible.sort((a, b) => a.id - b.id);
  if (state.sort === "effort") {
    const order = { "🌱": 0, "🌿": 1, "🌳": 2 };
    visible.sort((a, b) => order[a.effort] - order[b.effort] || a.id - b.id);
  }
  return visible;
}

function appCardMarkup(app) {
  const favorite = isFavorite(app.id);
  return `
    <article class="app-card" data-app-context="${app.id}">
      <button class="app-card-main" data-action="open-app" data-id="${app.id}" aria-label="Открыть ByAzen: ${escapeHtml(app.title)}" title="ЛКМ — открыть · ПКМ — действия и информация">
        <span class="card-topline">
          <span class="app-icon-tile">${renderIcon(app.icon, 20)}</span>
          <span class="app-mark"><span>ByAzen</span><span class="app-number">${String(app.id).padStart(3, "0")}</span></span>
        </span>
        <span class="app-title">${escapeHtml(app.title)}</span>
        <span class="app-description">${escapeHtml(app.description)}</span>
        <span class="app-card-footer"><span class="app-category-label">${escapeHtml(app.category)}</span><span class="effort-label">${app.effort}</span></span>
      </button>
      <button class="favorite-button ${favorite ? "is-favorite" : ""}" data-action="toggle-favorite" data-id="${app.id}" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}: ${escapeHtml(app.title)}" aria-pressed="${favorite}" title="${favorite ? "Убрать из избранного" : "В избранное"}">
        ${renderIcon("Star", 15)}
      </button>
    </article>
  `;
}

function renderHero() {
  const quick = [appById(1), appById(15), appById(126)].filter(Boolean);
  return `
    <section class="hero-panel" aria-label="Приветствие ByAzen">
      <div class="hero-copy">
        <div class="eyebrow">Личное рабочее пространство</div>
        <h2>Меньше рутины.<br />Больше своего потока.</h2>
        <p>185 небольших инструментов для работы, идей и ежедневных задач — в одной аккуратной библиотеке.</p>
        <button class="primary-button" data-action="open-app" data-id="15">${renderIcon("Command", 15)}Открыть хоткей-лаунчер${renderIcon("ArrowUpRight", 14)}</button>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-ring"><span class="hero-orbit-dot"></span></div>
        <div class="hero-app-window">
          <div class="hero-window-top"><span class="hero-window-dots"><i></i><i></i><i></i></span><span>Быстрый запуск</span><span>⌘ K</span></div>
          <div class="hero-window-content">
            <div class="hero-search-row">${renderIcon("Search", 14)}<span>Найти нужное…</span></div>
            ${quick.map((item) => `<div class="hero-suggestion">${renderIcon(item.icon, 14)}<span>${escapeHtml(item.title)}</span><small>${String(item.id).padStart(3, "0")}</small></div>`).join("")}
          </div>
        </div>
        <span class="hero-float-icon hero-float-1">${renderIcon("Sparkles", 18)}</span>
        <span class="hero-float-icon hero-float-2">${renderIcon("FileStack", 18)}</span>
        <span class="hero-float-icon hero-float-3">${renderIcon("AudioLines", 18)}</span>
      </div>
    </section>
  `;
}

function emptyStateMarkup() {
  let title = "Ничего не найдено";
  let text = "Попробуй другой запрос или сбрось фильтры.";
  let glyph = "SearchX";
  if (state.mode === "favorites" && state.favorites.size === 0 && !state.query) {
    title = "Пока ничего не сохранено";
    text = "Добавляй приложения в избранное звёздочкой — они появятся здесь.";
    glyph = "Star";
  } else if (state.mode === "recent" && state.recents.length === 0 && !state.query) {
    title = "Здесь появятся недавние приложения";
    text = "Открой любой инструмент из библиотеки, чтобы быстро вернуться к нему позже.";
    glyph = "History";
  }
  return `<div class="empty-state"><div><span class="empty-icon">${renderIcon(glyph, 22)}</span><h3>${title}</h3><p>${text}</p><button class="quiet-button" data-action="show-mode" data-mode="all">${renderIcon("PanelsTopLeft", 14)}Показать все приложения</button></div></div>`;
}

function homeMarkup() {
  const items = getVisibleApps();
  const category = state.mode === "category" ? categories.find((item) => item.id === state.categoryId) : null;
  const title = state.query.trim() ? "Результаты поиска" : category ? category.name : state.mode === "favorites" ? "Избранное" : state.mode === "recent" ? "Недавно открытые" : "Твоя библиотека приложений";
  const subtitle = state.query.trim() ? `По запросу «${state.query.trim()}»` : category ? `${category.count} приложения в этом направлении` : state.mode === "favorites" ? "Сохраняй самые нужные инструменты рядом." : state.mode === "recent" ? "К приложениям, которые ты открывал недавно." : "Одна библиотека для маленьких инструментов, больших идей и повседневной работы.";
  const showHero = state.mode === "all" && !state.query.trim();
  const categoryChips = state.mode === "all" || state.mode === "category" ? `
    <div class="category-chips" aria-label="Фильтр по направлениям">
      <button class="category-chip ${state.mode === "all" ? "active" : ""}" data-action="show-mode" data-mode="all">${renderIcon("PanelsTopLeft", 13)}Все направления <span>${apps.length}</span></button>
      ${categories.map((item) => `<button class="category-chip ${state.mode === "category" && state.categoryId === item.id ? "active" : ""}" data-action="show-category" data-category="${item.id}">${renderIcon(item.icon, 13)}${escapeHtml(item.short)} <span>${item.count}</span></button>`).join("")}
    </div>
  ` : "";
  return `
    <div class="page-content">
      <section class="page-heading">
        <div><div class="eyebrow">Каталог&nbsp; / &nbsp;личное пространство</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
        <div class="heading-stat"><span><strong>185</strong>&nbsp; приложений</span><span class="heading-stat-line"></span><span><strong>14</strong>&nbsp; направлений</span></div>
      </section>
      ${showHero ? renderHero() : ""}
      <section class="catalog-section" aria-label="Каталог приложений">
        <div class="section-head">
          <div><h2 class="section-title">${state.query.trim() ? "Совпадения" : category ? "Приложения направления" : state.mode === "favorites" ? "Сохранённые инструменты" : state.mode === "recent" ? "История запуска" : "Все приложения"}<span>${items.length}</span></h2><p class="section-caption">${items.length === apps.length ? "Выбери инструмент, чтобы открыть его рабочую область." : "Фильтруй, сортируй и открывай нужное в один клик."}</p></div>
          <div class="catalog-tools">
            <select class="sort-select" data-sort-select aria-label="Сортировка приложений">
              <option value="default" ${state.sort === "default" ? "selected" : ""}>По списку</option>
              <option value="az" ${state.sort === "az" ? "selected" : ""}>А–Я</option>
              <option value="id" ${state.sort === "id" ? "selected" : ""}>По номеру</option>
              <option value="effort" ${state.sort === "effort" ? "selected" : ""}>По объёму</option>
            </select>
            <div class="view-switch" aria-label="Вид каталога">
              <button class="${state.layout === "grid" ? "active" : ""}" data-action="set-layout" data-layout="grid" aria-label="Сетка" title="Сетка">${renderIcon("LayoutGrid", 14)}</button>
              <button class="${state.layout === "list" ? "active" : ""}" data-action="set-layout" data-layout="list" aria-label="Список" title="Список">${renderIcon("List", 14)}</button>
            </div>
          </div>
        </div>
        ${categoryChips}
        ${items.length ? `<div class="app-grid ${state.layout === "list" ? "list" : ""}">${items.map(appCardMarkup).join("")}</div>` : emptyStateMarkup()}
      </section>
      <footer class="catalog-footer"><span>ByAzen Suite</span><span>${apps.length} интерактивных макетов · данные сохраняются в этом браузере</span></footer>
    </div>
  `;
}

function demoDisclaimer() {
  return `<div class="demo-disclaimer">Интерактивный макет. Здесь используются демонстрационные данные; системные файлы, устройства и службы не изменяются.</div>`;
}

function demoHeading(app, subtitle = "Рабочая область макета") {
  return `<div class="demo-app-top"><div><div class="demo-app-title">${escapeHtml(app.title)}</div><div class="demo-app-subtitle">${escapeHtml(subtitle)}</div></div><div class="demo-toolbar"><button class="demo-icon-button" data-action="demo-refresh" aria-label="Обновить" title="Обновить">${renderIcon("RefreshCw", 14)}</button><button class="demo-icon-button" data-action="demo-help" aria-label="Информация" title="Информация">${renderIcon("Info", 14)}</button></div></div>`;
}

function clipboardDemo(app) {
  const items = [
    ["Техническое задание — список правок", "Текст · 2 минуты назад", "FileText"],
    ["https://byazen.local/workspace", "Ссылка · 18 минут назад", "Link2"],
    ["npm run build", "Код · сегодня, 09:42", "Code2"],
  ];
  return `<div class="demo-app">${demoHeading(app, "История скопированного · 3 элемента")}
    <label class="demo-field">${renderIcon("Search", 15)}<input data-demo-filter placeholder="Поиск по истории…" aria-label="Поиск по истории буфера" /></label>
    <div class="demo-list">${items.map(([title, meta, ico]) => `<div class="demo-list-row" data-filter-text="${escapeHtml(title)}">${renderIcon(ico, 16)}<div class="demo-list-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></div><button class="demo-list-action" data-action="demo-copy" data-copy="${escapeHtml(title)}" title="Скопировать">${renderIcon("Copy", 13)}</button><button class="demo-list-action" data-action="demo-pin" title="Закрепить">${renderIcon("Pin", 13)}</button></div>`).join("")}</div>
    <button class="secondary-button" data-action="demo-copy" data-copy="Техническое задание — список правок">${renderIcon("CornerDownLeft", 14)}Вставить выбранное <span class="muted-shortcut">↵</span></button>${demoDisclaimer()}</div>`;
}

function converterDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Добавь файл, чтобы подготовить конвертацию")}
    <div class="demo-dropzone" data-dropzone><div><span class="dropzone-icon">${renderIcon("Upload", 20)}</span><strong data-file-name>Перетащи файл сюда</strong><p>или выбери его на устройстве · демо без обработки</p><button class="secondary-button" data-action="demo-select-file">${renderIcon("FolderOpen", 14)}Выбрать файл</button><input type="file" data-demo-file /></div></div>
    <div class="demo-split"><div class="demo-stat"><span>Исходный формат</span><strong data-source-format>—</strong></div><div class="demo-stat"><span>Формат результата</span><strong>JPG</strong></div></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-convert">${renderIcon("ArrowRightLeft", 14)}Подготовить пример</button><span class="demo-inline-result" data-convert-status>Ждёт файл</span></div>${demoDisclaimer()}</div>`;
}

function renameDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Предпросмотр · реальные файлы не переименовываются")}
    <div class="demo-input-row"><label class="demo-field">${renderIcon("TextCursorInput", 15)}<input data-rename-pattern value="photo_{n}" aria-label="Шаблон нового имени" /></label><button class="secondary-button" data-action="demo-rename">${renderIcon("WandSparkles", 14)}Предпросмотр</button></div>
    <div class="demo-list" data-rename-list>${["IMG_8041.jpg", "IMG_8042.jpg", "IMG_8043.jpg"].map((file, i) => `<div class="demo-list-row">${renderIcon("Image", 16)}<div class="demo-list-copy"><strong>${file}</strong><small>→ <span data-rename-result="${i + 1}">photo_${String(i + 1).padStart(2, "0")}.jpg</span></small></div><span class="demo-small-note">${(2.4 + i * .6).toFixed(1)} MB</span></div>`).join("")}</div>${demoDisclaimer()}</div>`;
}

function phraseDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Локальный демонстратор фраз · не используй для реальных секретов")}
    <div class="info-card"><span class="info-card-label">ТЕСТОВАЯ ФРАЗА</span><strong id="phrase-output" style="font-family:ui-monospace,monospace;font-size:17px;letter-spacing:.015em">луна-кофе-лес-река</strong><p>Оценка энтропии: <span id="phrase-entropy">≈ 52 бит</span></p></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-generate-phrase">${renderIcon("RefreshCw", 14)}Сгенерировать пример</button><button class="secondary-button" data-action="demo-copy" data-copy="луна-кофе-лес-река">${renderIcon("Copy", 14)}Копировать</button></div>${demoDisclaimer()}</div>`;
}

function pomodoroDemo(app) {
  const display = `${String(Math.floor(state.pomodoro.remaining / 60)).padStart(2, "0")}:${String(state.pomodoro.remaining % 60).padStart(2, "0")}`;
  return `<div class="demo-app">${demoHeading(app, "Фокус · демонстрационный таймер")}
    <div class="demo-stage"><div class="demo-stage-grid"></div><div style="position:relative;text-align:center"><div class="stepper-number" id="pomodoro-time">${display}</div><div class="demo-small-note" id="pomodoro-status">${state.pomodoro.running ? "Сессия идёт" : "Готов к фокусу"}</div></div></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-pomodoro-toggle">${renderIcon(state.pomodoro.running ? "Pause" : "Play", 14)}${state.pomodoro.running ? "Пауза" : "Начать сессию"}</button><button class="secondary-button" data-action="demo-pomodoro-reset">${renderIcon("RotateCcw", 14)}Сбросить</button></div>${demoDisclaimer()}</div>`;
}

function colorPickerDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Цвет под курсором · браузерная палитра-пример")}
    <div class="demo-preview" style="min-height:205px"><div class="demo-preview-screen" id="color-preview" style="background:radial-gradient(circle at 50% 50%, #66745b, #20251f 66%)"><div class="preview-window">${renderIcon("Pipette", 26)}</div><span class="preview-overlay"></span></div></div>
    <div class="demo-input-row"><label class="demo-field" style="flex:0 0 115px"><input type="color" data-demo-color value="#87977a" aria-label="Выбрать цвет" style="width:24px;height:24px;padding:0;border:0;cursor:pointer" /><span data-color-value>#87977A</span></label><button class="secondary-button" data-action="demo-copy" data-copy="#87977A">${renderIcon("Copy", 14)}Копировать HEX</button></div>${demoDisclaimer()}</div>`;
}

function launcherDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Быстрый поиск по библиотеке · пример Ctrl + Space")}
    <label class="demo-field">${renderIcon("Search", 15)}<input data-demo-launch-search placeholder="Начни вводить название…" aria-label="Поиск приложений в демо" /></label>
    <div class="demo-list" data-launch-results>${[appById(1), appById(18), appById(126)].map((item) => `<div class="demo-list-row" data-filter-text="${escapeHtml(item.title)}">${renderIcon(item.icon, 16)}<div class="demo-list-copy"><strong>${escapeHtml(item.title)}</strong><small>ByAzen · ${escapeHtml(item.category)}</small></div><span class="demo-small-note">↵</span></div>`).join("")}</div>${demoDisclaimer()}</div>`;
}

function genericUtilityDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Быстрый обзор рабочей области")}
    <div class="demo-split"><div class="demo-stat"><span>Элементов в макете</span><strong>03</strong></div><div class="demo-stat"><span>Состояние</span><strong style="font-size:13px;color:#b7c7a6">Готово</strong></div></div>
    <div class="demo-list">${["Рабочая область", "Недавние данные", "Настройки инструмента"].map((row, i) => `<div class="demo-list-row">${renderIcon([app.icon, "Clock3", "Settings2"][i], 16)}<div class="demo-list-copy"><strong>${row}</strong><small>${i === 0 ? escapeHtml(app.title) : "Демонстрационный элемент"}</small></div><button class="demo-list-action" data-action="demo-open-row" title="Открыть">${renderIcon("ArrowUpRight", 13)}</button></div>`).join("")}</div>
    <button class="secondary-button" data-action="demo-refresh">${renderIcon("RefreshCw", 14)}Обновить демо-данные</button>${demoDisclaimer()}</div>`;
}

function screenDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Предпросмотр экрана · системный захват отключён")}
    <div class="demo-preview"><div class="demo-preview-screen" data-screen-grid><div class="preview-window">${renderIcon(app.icon, 25)}<span class="preview-overlay"></span></div></div></div>
    <div class="demo-input-row"><button class="secondary-button" data-action="demo-toggle-grid">${renderIcon("Grid3X3", 14)}Показать сетку</button><label class="demo-field" style="flex:1"><span style="white-space:nowrap">Масштаб</span><input class="demo-range" type="range" min="50" max="150" value="100" data-demo-zoom aria-label="Масштаб предпросмотра" /></label></div>${demoDisclaimer()}</div>`;
}

function filesDemo(app) {
  const rows = [["Рабочий стол", "Папка · 24 элемента", "Folder"], ["Заметки проекта.pdf", "PDF · 4.8 MB", "FileText"], ["Изображения", "Папка · 8 элементов", "Images"], ["Архив_2025.zip", "ZIP · 12.1 MB", "Archive"]];
  return `<div class="demo-app">${demoHeading(app, "Образец файловой области · без доступа к диску")}
    <label class="demo-field">${renderIcon("Search", 15)}<input data-demo-filter placeholder="Поиск по демо-элементам…" /></label>
    <div class="demo-list">${rows.map(([name, meta, glyph]) => `<div class="demo-list-row" data-filter-text="${escapeHtml(name)}">${renderIcon(glyph, 16)}<div class="demo-list-copy"><strong>${name}</strong><small>${meta}</small></div><button class="demo-list-action" data-action="demo-open-row" title="Открыть">${renderIcon("ArrowUpRight", 13)}</button></div>`).join("")}</div>
    <button class="secondary-button" data-action="demo-scan">${renderIcon("ScanSearch", 14)}Сканировать пример</button>${demoDisclaimer()}</div>`;
}

function keyboardDemo(app) {
  const keys = ["Esc", "F1", "F2", "F3", "Tab", "Q", "W", "E", "R", "A", "S", "D", "F", "Shift", "Ctrl", "Alt", "Space", "↵"];
  return `<div class="demo-app">${demoHeading(app, "Интерактивная раскладка · нажми на клавишу")}
    <div class="demo-keys">${keys.map((key) => `<button class="demo-key ${key === "Space" ? "wide" : ""}" data-action="demo-press-key" data-key="${key}">${key}</button>`).join("")}</div>
    <div class="demo-split"><div class="demo-stat"><span>Последняя клавиша</span><strong id="last-key">—</strong></div><div class="demo-stat"><span>Нажатий в демо</span><strong id="key-count">0</strong></div></div>${demoDisclaimer()}</div>`;
}

function gameDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Игровая сцена · прототип управления")}
    <div class="demo-stage" id="game-stage"><div class="demo-stage-grid"></div><span class="demo-stage-mark" id="game-player">${renderIcon(app.icon, 32)}</span><span class="demo-stage-copy"><strong id="game-score">0</strong> &nbsp; очков · демонстрация</span></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-game-start">${renderIcon("Play", 14)}${app.id === 60 ? "Прыгнуть" : "Начать демо"}</button><button class="secondary-button" data-action="demo-game-reset">${renderIcon("RotateCcw", 14)}Сбросить</button></div>${demoDisclaimer()}</div>`;
}

function creativeDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Визуальная сцена · один спокойный акцент")}
    <div class="art-board" id="art-board"><div class="art-caption">BYAZEN / GENERATIVE STUDY</div><div class="art-shape" id="art-shape"></div><div class="art-title" id="art-title">Quiet<br />geometry</div></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-shuffle-art">${renderIcon("Shuffle", 14)}Создать вариацию</button><button class="secondary-button" data-action="demo-export">${renderIcon("Download", 14)}Экспорт (демо)</button></div>${demoDisclaimer()}</div>`;
}

function audioDemo(app) {
  const bars = Array.from({ length: 42 }, (_, index) => {
    const height = 16 + ((index * 17 + app.id * 11) % 58);
    return `<i style="--bar-height:${height}px;--n:${index}"></i>`;
  }).join("");
  return `<div class="demo-app">${demoHeading(app, "Локальный аудио-макет · реальный звук не воспроизводится")}
    <div class="demo-list-row">${renderIcon(app.icon, 18)}<div class="demo-list-copy"><strong>Тихий рабочий микс</strong><small>Демо-проект · 03:28</small></div><span class="demo-small-note">44.1 kHz</span></div>
    <div class="waveform" data-waveform>${bars}</div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-audio-toggle">${renderIcon("Play", 14)}<span>Воспроизвести демо</span></button><label class="demo-field" style="flex:1">${renderIcon("Volume2", 15)}<input type="range" min="0" max="100" value="62" class="demo-range" aria-label="Громкость демо" /></label></div>${demoDisclaimer()}</div>`;
}

function aiDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Локальная модель · ответы в этом макете имитируются")}
    <div class="chat-window" data-chat-window><div class="chat-bubble"><small>ByAzen · локальный помощник</small>Привет! Напиши вопрос — я покажу, как может выглядеть диалог без облака.</div></div>
    <form class="demo-input-row" data-chat-form><label class="demo-field">${renderIcon("MessageSquare", 15)}<input name="message" autocomplete="off" placeholder="Спроси что-нибудь…" aria-label="Сообщение помощнику" required /></label><button class="primary-button" type="submit" aria-label="Отправить">${renderIcon("ArrowUp", 14)}</button></form>${demoDisclaimer()}</div>`;
}

function networkDemo(app) {
  const devices = [["Этот компьютер", "192.168.1.12 · локально", "Laptop"], ["Домашний роутер", "192.168.1.1 · gateway", "Router"], ["Медиа-устройство", "192.168.1.24 · пример", "Monitor"]];
  return `<div class="demo-app">${demoHeading(app, "Пример домашней сети · вымышленные устройства")}
    <div class="network-list">${devices.map(([name, details, glyph]) => `<div class="network-row"> <span class="network-avatar">${renderIcon(glyph, 15)}</span><div><strong>${name}</strong><small>${details}</small></div><span class="network-state">в сети</span></div>`).join("")}</div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-scan">${renderIcon("Radar", 14)}Сканировать демо</button><span class="demo-inline-result" data-scan-status>Последняя проверка: сейчас</span></div>${demoDisclaimer()}</div>`;
}

function productivityDemo(app) {
  if (app.id === 126) {
    const note = readStore(NOTES_KEY, "# Идея дня\n\nСвяжи заметку с тем, что уже знаешь…");
    return `<div class="demo-app">${demoHeading(app, "Markdown-черновик · сохраняется только в этом браузере")}
      <label class="demo-field" style="align-items:flex-start;padding:10px"><textarea data-note-editor rows="8" style="resize:vertical;line-height:1.65">${escapeHtml(note)}</textarea></label>
      <div class="demo-input-row"><button class="primary-button" data-action="demo-save-note">${renderIcon("Save", 14)}Сохранить черновик</button><span class="demo-inline-result" id="note-save-status">Локальное демо</span></div>${demoDisclaimer()}</div>`;
  }
  const tasks = state.taskRows;
  return `<div class="demo-app">${demoHeading(app, "Список задач · состояние сохраняется в браузере")}
    <form class="demo-input-row" data-task-form><label class="demo-field">${renderIcon("Plus", 15)}<input name="task" autocomplete="off" placeholder="Добавить короткую задачу…" aria-label="Новая задача" required /></label><button class="primary-button" type="submit">Добавить</button></form>
    <div class="task-list" data-task-list>${tasks.map((task, index) => `<label class="task-row"><input type="checkbox" data-task-toggle="${index}" /><span>${escapeHtml(task)}</span></label>`).join("")}</div>${demoDisclaimer()}</div>`;
}

function devDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Изолированный терминал-превью · команды не выполняются")}
    <div class="terminal-preview" data-terminal-output><div class="terminal-line"><span>byazen</span> · ${escapeHtml(app.title)}</div><div class="terminal-output">Демо-среда готова. Введи <strong>help</strong> для списка команд.</div></div>
    <form class="demo-input-row" data-terminal-form><label class="demo-field" style="font-family:ui-monospace,monospace">$ <input name="command" autocomplete="off" placeholder="help" aria-label="Команда демо-терминала" /></label><button class="primary-button" type="submit">Выполнить</button></form>${demoDisclaimer()}</div>`;
}

function hardwareDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Датчики и значения — демонстрационные")}
    <div class="metric-grid">${[["CPU", "42°", 42], ["ПАМЯТЬ", "58%", 58], ["БАТАРЕЯ", "86%", 86]].map(([label, value, width]) => `<div class="metric-card"><span>${label}</span><strong data-metric-value="${label}">${value}</strong><div class="metric-track"><i style="--value:${width}%"></i></div></div>`).join("")}</div>
    <div class="demo-input-row"><button class="secondary-button" data-action="demo-refresh-metrics">${renderIcon("RefreshCw", 14)}Обновить демо</button><span class="demo-inline-result">без системного опроса</span></div>${demoDisclaimer()}</div>`;
}

function prankDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Безопасный предпросмотр · ничего не накладывается на рабочий стол")}
    <div class="demo-effect" data-effect-preview><div class="demo-effect-card">${renderIcon(app.icon, 25)}<strong data-effect-title>${escapeHtml(app.title)}</strong><small>Пранк-превью · только внутри окна</small></div></div>
    <div class="demo-input-row"><button class="primary-button" data-action="demo-toggle-effect">${renderIcon("Eye", 14)}Показать превью</button><button class="secondary-button" data-action="demo-reset-effect">${renderIcon("RotateCcw", 14)}Сбросить</button></div>${demoDisclaimer()}</div>`;
}

function learningDemo(app) {
  return `<div class="demo-app">${demoHeading(app, "Маленькая интерактивная модель")}
    <div class="demo-stage"><div class="demo-stage-grid"></div><span class="demo-stage-mark">${renderIcon(app.icon, 31)}</span><span class="demo-stage-copy"><strong id="model-state">Состояние 0</strong> &nbsp; · пошаговая симуляция</span></div>
    <div class="demo-split"><div class="demo-stat"><span>Сделано шагов</span><strong id="demo-count">0</strong></div><div class="demo-stat"><span>Режим</span><strong style="font-size:13px">Изучение</strong></div></div>
    <button class="primary-button" data-action="demo-step">${renderIcon("ArrowRight", 14)}Сделать шаг</button>${demoDisclaimer()}</div>`;
}

function renderDemo(app) {
  if (app.categoryId === 1) {
    if (app.id === 1) return clipboardDemo(app);
    if (app.id === 3) return converterDemo(app);
    if (app.id === 4) return renameDemo(app);
    if (app.id === 12) return phraseDemo(app);
    if (app.id === 15) return launcherDemo(app);
    if (app.id === 18) return pomodoroDemo(app);
    if (app.id === 24) return colorPickerDemo(app);
    return genericUtilityDemo(app);
  }
  if (app.categoryId === 2) return app.id === 24 ? colorPickerDemo(app) : screenDemo(app);
  if (app.categoryId === 3) return filesDemo(app);
  if (app.categoryId === 4) return keyboardDemo(app);
  if (app.categoryId === 5) return gameDemo(app);
  if (app.categoryId === 6) return creativeDemo(app);
  if (app.categoryId === 7) return audioDemo(app);
  if (app.categoryId === 8) return aiDemo(app);
  if (app.categoryId === 9) return networkDemo(app);
  if (app.categoryId === 10) return productivityDemo(app);
  if (app.categoryId === 11) return devDemo(app);
  if (app.categoryId === 12) return hardwareDemo(app);
  if (app.categoryId === 13) return prankDemo(app);
  return learningDemo(app);
}

function workspaceMarkup(app) {
  return `
    <div class="workspace-page" data-app-context="${app.id}">
      <div class="workspace-back-row"><button class="back-button" data-action="back">${renderIcon("ArrowLeft", 15)}Назад к библиотеке</button><span class="prototype-label">Интерактивный макет</span></div>
      <section class="workspace-identity">
        <span class="app-icon-tile">${renderIcon(app.icon, 26)}</span>
        <div class="workspace-identity-copy"><div class="workspace-brand-line"><span>ByAzen</span><span>·</span><span class="app-number">APP ${String(app.id).padStart(3, "0")}</span><span>·</span><span>${escapeHtml(app.category)}</span></div><h1>${escapeHtml(app.title)}</h1><p>${escapeHtml(app.description)}</p></div>
        <button class="favorite-button workspace-fav ${isFavorite(app.id) ? "is-favorite" : ""}" data-action="toggle-favorite" data-id="${app.id}" aria-label="${isFavorite(app.id) ? "Убрать из избранного" : "Добавить в избранное"}" aria-pressed="${isFavorite(app.id)}" title="Избранное">${renderIcon("Star", 17)}</button>
      </section>
      <div class="workspace-grid">
        <section class="demo-panel"><div class="demo-panel-heading"><div><p>Рабочая область</p><h2>ByAzen · ${escapeHtml(app.title)}</h2></div><span class="demo-chip">DEMO</span></div><div class="demo-content">${renderDemo(app)}</div></section>
        <aside class="info-column" aria-label="Сведения о макете">
          <section class="info-card"><span class="info-card-label">Состояние</span><strong>Макет готов к просмотру</strong><p>Управление доступно в пределах этой демонстрационной области.</p></section>
          <section class="info-card"><span class="info-card-label">Направление</span><strong>${escapeHtml(app.category)}</strong><p>Модуль ${String(app.id).padStart(3, "0")} из 185.</p></section>
          <section class="info-card"><span class="info-card-label">Предлагаемый стек</span><strong>${escapeHtml(app.stack)}</strong><p>Технология указана по исходной идее.</p></section>
          <section class="info-card"><div class="info-row"><span class="info-card-label" style="margin:0">Объём идеи</span><span class="info-effort">${app.effort}</span></div><p>Метка перенесена из списка приложений.</p></section>
          <div class="info-note">${renderIcon("ShieldCheck", 14)}<span>Этот экран — UI-прототип. Файлы, настройки ОС, сеть и устройства не изменяются.</span></div>
        </aside>
      </div>
    </div>
  `;
}

function contextMenuMarkup() {
  const app = appById(state.contextAppId);
  if (!app || !state.contextPosition) return "";
  const width = 264;
  const height = 202;
  const left = Math.max(12, Math.min(state.contextPosition.x, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(state.contextPosition.y, window.innerHeight - height - 12));
  const favorite = isFavorite(app.id);
  return `
    <div class="context-menu-layer">
      <button class="context-menu-scrim" type="button" data-action="dismiss-context" aria-label="Закрыть контекстное меню"></button>
      <section class="app-context-menu" role="menu" aria-label="Действия: ${escapeHtml(app.title)}" style="left:${left}px;top:${top}px">
        <div class="context-menu-heading">
          <span class="app-icon-tile">${renderIcon(app.icon, 18)}</span>
          <span class="context-menu-heading-copy"><span>BYAZEN · APP ${String(app.id).padStart(3, "0")}</span><strong>${escapeHtml(app.title)}</strong></span>
        </div>
        <div class="context-menu-divider"></div>
        <button class="context-menu-item" type="button" role="menuitem" data-action="context-open" data-id="${app.id}" data-context-first>${renderIcon("ArrowUpRight", 15)}<span>Открыть приложение</span><kbd>↵</kbd></button>
        <button class="context-menu-item" type="button" role="menuitem" data-action="context-info" data-id="${app.id}">${renderIcon("Info", 15)}<span>Информация</span><kbd>i</kbd></button>
        <button class="context-menu-item" type="button" role="menuitem" data-action="context-favorite" data-id="${app.id}">${renderIcon("Star", 15)}<span>${favorite ? "Убрать из избранного" : "В избранное"}</span></button>
      </section>
    </div>
  `;
}

function infoDialogMarkup() {
  const app = appById(state.infoAppId);
  if (!app) return "";
  return `
    <div class="info-modal-layer" data-action="close-info">
      <section class="app-info-dialog" role="dialog" aria-modal="true" aria-labelledby="app-info-title" aria-describedby="app-info-description">
        <header class="info-dialog-header">
          <div class="info-dialog-kicker">${renderIcon("Info", 14)}ИНФОРМАЦИЯ О ПРИЛОЖЕНИИ</div>
          <button class="icon-button info-dialog-close" type="button" data-action="close-info" data-info-close aria-label="Закрыть информацию">${renderIcon("X", 16)}</button>
        </header>
        <div class="info-dialog-app-heading">
          <span class="app-icon-tile">${renderIcon(app.icon, 25)}</span>
          <div><div class="info-dialog-app-id">BYAZEN · APP ${String(app.id).padStart(3, "0")}</div><h2 id="app-info-title">${escapeHtml(app.title)}</h2><p>${escapeHtml(app.category)}</p></div>
        </div>
        <div class="app-health-banner">
          <span class="app-health-icon">${renderIcon("CircleCheck", 17)}</span>
          <div><strong>Интерфейс доступен</strong><small>Макет приложения открывается в библиотеке</small></div>
          <span class="demo-status-pill">ДЕМО</span>
        </div>
        <div class="info-detail-grid">
          <div class="info-detail-cell"><span>Номер</span><strong>APP ${String(app.id).padStart(3, "0")}</strong></div>
          <div class="info-detail-cell"><span>Объём идеи</span><strong>${app.effort}</strong></div>
          <div class="info-detail-cell info-detail-wide"><span>Предлагаемый стек</span><strong>${escapeHtml(app.stack)}</strong></div>
        </div>
        <section class="info-description-block"><span class="info-dialog-label">НАЗНАЧЕНИЕ</span><p id="app-info-description">${escapeHtml(app.description)}</p></section>
        <section class="suite-health-card">
          <div class="suite-health-heading"><span class="status-orb"></span><strong>${apps.length} из ${apps.length} интерфейсных макетов доступны</strong></div>
          <p>Все приложения можно открыть и просмотреть. Реальные интеграции с ОС, файлами, сетью и устройствами пока не подключены — действия внутри являются демо.</p>
        </section>
        <footer class="info-dialog-footer"><span>${renderIcon("ShieldCheck", 14)}Системные изменения не выполняются</span><button class="primary-button" type="button" data-action="info-open-app" data-id="${app.id}">${renderIcon("ArrowUpRight", 14)}Открыть</button></footer>
      </section>
    </div>
  `;
}

function appMarkup() {
  const app = currentApp();
  return `<div class="app-frame">${sidebarMarkup()}<div class="main-shell">${topbarMarkup()}<main class="main-content">${app ? workspaceMarkup(app) : homeMarkup()}</main></div><div class="toast-stack" aria-live="polite" aria-atomic="false"></div>${contextMenuMarkup()}${infoDialogMarkup()}</div>`;
}

function render({ focusSearch = false, cursor = null } = {}) {
  root.innerHTML = appMarkup();
  if (focusSearch) {
    const input = root.querySelector("[data-global-search]");
    if (input) {
      input.focus({ preventScroll: true });
      if (cursor) input.setSelectionRange(cursor.start, cursor.end);
    }
  }
  bindTransientInteractions();
  if (state.infoAppId !== null) root.querySelector("[data-info-close]")?.focus({ preventScroll: true });
  else if (state.contextAppId !== null) root.querySelector("[data-context-first]")?.focus({ preventScroll: true });
}

function toast(message, kind = "success") {
  const stack = root.querySelector(".toast-stack");
  if (!stack) return;
  const element = document.createElement("div");
  element.className = `toast ${kind === "error" ? "error" : ""}`;
  element.innerHTML = `${renderIcon(kind === "error" ? "CircleAlert" : "CircleCheck", 15)}<span>${escapeHtml(message)}</span>`;
  stack.append(element);
  window.setTimeout(() => {
    element.classList.add("fade");
    window.setTimeout(() => element.remove(), 240);
  }, 2500);
}

function selectMode(mode) {
  state.mode = mode;
  state.categoryId = null;
  state.activeAppId = null;
  state.returnView = null;
  state.query = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectCategory(id) {
  state.mode = "category";
  state.categoryId = Number(id);
  state.activeAppId = null;
  state.returnView = null;
  state.query = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openApp(id) {
  const app = appById(id);
  if (!app) return;
  state.returnView = { mode: state.mode, categoryId: state.categoryId, query: state.query };
  state.activeAppId = app.id;
  state.query = "";
  state.recents = [app.id, ...state.recents.filter((item) => item !== app.id)].slice(0, 12);
  writeStore(RECENTS_KEY, state.recents);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function backToLibrary() {
  const previous = state.returnView;
  state.activeAppId = null;
  state.returnView = null;
  if (previous) {
    state.mode = previous.mode;
    state.categoryId = previous.categoryId;
    state.query = previous.query;
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleFavorite(id) {
  const numericId = Number(id);
  const added = !state.favorites.has(numericId);
  if (added) state.favorites.add(numericId);
  else state.favorites.delete(numericId);
  writeStore(FAVORITES_KEY, [...state.favorites]);
  render();
  toast(added ? "Добавлено в избранное" : "Убрано из избранного");
}

function startPomodoro() {
  state.pomodoro.running = true;
  state.pomodoro.interval = window.setInterval(() => {
    if (!state.pomodoro.running) return;
    state.pomodoro.remaining = Math.max(0, state.pomodoro.remaining - 1);
    const time = root.querySelector("#pomodoro-time");
    if (time) time.textContent = `${String(Math.floor(state.pomodoro.remaining / 60)).padStart(2, "0")}:${String(state.pomodoro.remaining % 60).padStart(2, "0")}`;
    if (state.pomodoro.remaining <= 0) {
      state.pomodoro.running = false;
      window.clearInterval(state.pomodoro.interval);
      toast("Демо-сессия завершена");
      render();
    }
  }, 1000);
}

function stopPomodoro(reset = false) {
  state.pomodoro.running = false;
  window.clearInterval(state.pomodoro.interval);
  state.pomodoro.interval = null;
  if (reset) state.pomodoro.remaining = 25 * 60;
  const time = root.querySelector("#pomodoro-time");
  const status = root.querySelector("#pomodoro-status");
  if (time) time.textContent = `${String(Math.floor(state.pomodoro.remaining / 60)).padStart(2, "0")}:${String(state.pomodoro.remaining % 60).padStart(2, "0")}`;
  if (status) status.textContent = reset ? "Готов к фокусу" : "Пауза";
}

function generatePhrase() {
  const words = ["луна", "тихий", "река", "камень", "кофе", "сосна", "облако", "янтарь", "ветер", "книга", "чай", "ночь", "мох", "поле", "звезда", "берег"];
  const chosen = Array.from({ length: 4 }, () => words[Math.floor(Math.random() * words.length)]);
  const phrase = chosen.join("-");
  const output = root.querySelector("#phrase-output");
  const entropy = root.querySelector("#phrase-entropy");
  if (output) output.textContent = phrase;
  if (entropy) entropy.textContent = `≈ ${Math.round(4 * Math.log2(words.length))} бит`;
  const copy = root.querySelector('[data-action="demo-copy"]');
  if (copy) copy.dataset.copy = phrase;
}

function addChatMessage(message) {
  const windowEl = root.querySelector("[data-chat-window]");
  if (!windowEl) return;
  const userBubble = document.createElement("div");
  userBubble.className = "chat-bubble user";
  userBubble.textContent = message;
  windowEl.append(userBubble);
  const reply = document.createElement("div");
  reply.className = "chat-bubble";
  const label = document.createElement("small");
  label.textContent = "ByAzen · локальный помощник";
  reply.append(label, document.createTextNode("Это демонстрационный ответ интерфейса. В реальном приложении здесь работала бы выбранная локальная модель."));
  windowEl.append(reply);
  windowEl.scrollTop = windowEl.scrollHeight;
}

function bindTransientInteractions() {
  const dropzone = root.querySelector("[data-dropzone]");
  const fileInput = root.querySelector("[data-demo-file]");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      const name = root.querySelector("[data-file-name]");
      const format = root.querySelector("[data-source-format]");
      if (name && file) name.textContent = file.name;
      if (format && file) format.textContent = file.name.split(".").pop()?.toUpperCase() || "FILE";
      if (dropzone && file) dropzone.dataset.selected = file.name;
      const status = root.querySelector("[data-convert-status]");
      if (status && file) status.textContent = "Файл готов к предпросмотру";
    });
  }
  if (dropzone) {
    dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("dragging"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        const name = root.querySelector("[data-file-name]");
        const format = root.querySelector("[data-source-format]");
        if (name) name.textContent = file.name;
        if (format) format.textContent = file.name.split(".").pop()?.toUpperCase() || "FILE";
        dropzone.dataset.selected = file.name;
        const status = root.querySelector("[data-convert-status]");
        if (status) status.textContent = "Файл готов к предпросмотру";
      }
    });
  }
  root.querySelectorAll("[data-demo-filter]").forEach((input) => input.addEventListener("input", () => {
    const query = normalized(input.value);
    root.querySelectorAll("[data-filter-text]").forEach((row) => { row.hidden = !normalized(row.dataset.filterText).includes(query); });
  }));
  const launchSearch = root.querySelector("[data-demo-launch-search]");
  if (launchSearch) launchSearch.addEventListener("input", () => {
    const query = normalized(launchSearch.value);
    root.querySelectorAll("[data-launch-results] [data-filter-text]").forEach((row) => { row.hidden = !normalized(row.dataset.filterText).includes(query); });
  });
  const colorInput = root.querySelector("[data-demo-color]");
  if (colorInput) colorInput.addEventListener("input", () => {
    const color = colorInput.value.toUpperCase();
    const value = root.querySelector("[data-color-value]");
    const preview = root.querySelector("#color-preview");
    const copyButton = root.querySelector('[data-action="demo-copy"]');
    if (value) value.textContent = color;
    if (preview) preview.style.background = `radial-gradient(circle at 50% 50%, ${color}, #20251f 66%)`;
    if (copyButton) copyButton.dataset.copy = color;
  });
}

root.addEventListener("contextmenu", (event) => {
  const surface = event.target.closest("[data-app-context]");
  if (!surface) return;
  const appId = Number(surface.dataset.appContext);
  if (!appById(appId)) return;
  event.preventDefault();
  state.contextAppId = appId;
  state.contextPosition = { x: event.clientX, y: event.clientY };
  state.infoAppId = null;
  render();
});

root.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const id = actionTarget.dataset.id;
  if (action === "dismiss-context") { state.contextAppId = null; state.contextPosition = null; render(); return; }
  if (action === "context-open") { state.contextAppId = null; state.contextPosition = null; openApp(id); return; }
  if (action === "context-info") { state.contextAppId = null; state.contextPosition = null; state.infoAppId = Number(id); render(); return; }
  if (action === "context-favorite") { state.contextAppId = null; state.contextPosition = null; toggleFavorite(id); return; }
  if (action === "close-info") {
    if (actionTarget.classList.contains("info-modal-layer") && event.target !== actionTarget) return;
    state.infoAppId = null; render(); return;
  }
  if (action === "info-open-app") { state.infoAppId = null; openApp(id); return; }
  if (action === "home") { selectMode("all"); return; }
  if (action === "back") { backToLibrary(); return; }
  if (action === "show-mode") { selectMode(actionTarget.dataset.mode || "all"); return; }
  if (action === "show-category") { selectCategory(actionTarget.dataset.category); return; }
  if (action === "open-app") { openApp(id); return; }
  if (action === "toggle-favorite") { toggleFavorite(id); return; }
  if (action === "set-layout") { state.layout = actionTarget.dataset.layout; render(); return; }
  if (action === "demo-select-file") { root.querySelector("[data-demo-file]")?.click(); return; }
  if (action === "demo-convert") {
    const dropzone = root.querySelector("[data-dropzone]");
    const filename = dropzone?.dataset.selected;
    if (!filename) {
      toast("Сначала выбери файл для примера", "error");
      const status = root.querySelector("[data-convert-status]");
      if (status) status.textContent = "Нужен файл для предпросмотра";
      return;
    }
    const button = actionTarget;
    const previous = button.innerHTML;
    const status = root.querySelector("[data-convert-status]");
    button.disabled = true;
    button.innerHTML = `${renderIcon("LoaderCircle", 14, "spin")}Подготовка…`;
    if (status) status.textContent = "Подготовка демонстрационного результата…";
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.disabled = false;
      button.innerHTML = previous;
      if (status) status.textContent = `Предпросмотр готов · ${filename} → JPG (без конвертации)`;
      toast("Предпросмотр результата готов");
    }, 700);
    return;
  }
  if (action === "demo-copy") {
    const text = actionTarget.dataset.copy || "Демо-фрагмент ByAzen";
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
    toast("Скопировано в демо");
    return;
  }
  if (action === "demo-pin") { actionTarget.innerHTML = renderIcon("Pin", 13); actionTarget.style.color = "var(--accent)"; toast("Закреплено в макете"); return; }
  if (action === "demo-help") { toast("Это интерактивный макет без системных интеграций"); return; }
  if (action === "demo-refresh") { toast("Демо-данные обновлены"); return; }
  if (action === "demo-open-row") { toast("Элемент открыт в демонстрационной области"); return; }
  if (action === "demo-generate-phrase") { generatePhrase(); return; }
  if (action === "demo-rename") {
    const pattern = root.querySelector("[data-rename-pattern]")?.value?.trim() || "file_{n}";
    root.querySelectorAll("[data-rename-result]").forEach((el) => { el.textContent = pattern.replaceAll("{n}", String(el.dataset.renameResult).padStart(2, "0")) + ".jpg"; });
    toast("Предпросмотр имён обновлён");
    return;
  }
  if (action === "demo-pomodoro-toggle") {
    if (state.pomodoro.running) { stopPomodoro(); actionTarget.innerHTML = `${renderIcon("Play", 14)}Начать сессию`; }
    else { startPomodoro(); actionTarget.innerHTML = `${renderIcon("Pause", 14)}Пауза`; const status = root.querySelector("#pomodoro-status"); if (status) status.textContent = "Сессия идёт"; }
    return;
  }
  if (action === "demo-pomodoro-reset") { stopPomodoro(true); const button = root.querySelector('[data-action="demo-pomodoro-toggle"]'); if (button) button.innerHTML = `${renderIcon("Play", 14)}Начать сессию`; return; }
  if (action === "demo-toggle-grid") {
    const screen = root.querySelector("[data-screen-grid]");
    if (screen) screen.classList.toggle("grid-hidden");
    actionTarget.classList.toggle("active");
    actionTarget.innerHTML = `${renderIcon("Grid3X3", 14)}${actionTarget.classList.contains("active") ? "Скрыть сетку" : "Показать сетку"}`;
    return;
  }
  if (action === "demo-press-key") {
    actionTarget.classList.toggle("pressed");
    const last = root.querySelector("#last-key");
    const count = root.querySelector("#key-count");
    if (last) last.textContent = actionTarget.dataset.key;
    if (count) count.textContent = String((Number(count.textContent) || 0) + 1);
    return;
  }
  if (action === "demo-game-start") {
    const score = root.querySelector("#game-score");
    const player = root.querySelector("#game-player");
    const next = (Number(score?.textContent) || 0) + 1;
    if (score) score.textContent = String(next);
    if (player) player.style.transform = `translate(${(next % 3 - 1) * 16}px, ${-((next % 2) * 9)}px) rotate(${next % 2 ? 8 : -8}deg)`;
    toast("Ход засчитан · демо");
    return;
  }
  if (action === "demo-game-reset") {
    const score = root.querySelector("#game-score"); const player = root.querySelector("#game-player");
    if (score) score.textContent = "0"; if (player) player.style.transform = "none"; return;
  }
  if (action === "demo-shuffle-art") {
    const shape = root.querySelector("#art-shape"); const title = root.querySelector("#art-title");
    if (shape) shape.style.transform = `rotate(${Math.floor(Math.random() * 76) - 38}deg) translateX(${Math.floor(Math.random() * 30) - 15}px)`;
    if (title) title.textContent = ["Quiet geometry", "Soft structure", "Slow orbit", "Open form"][Math.floor(Math.random() * 4)];
    toast("Создана новая вариация"); return;
  }
  if (action === "demo-export") { toast("Экспорт доступен в полной версии приложения"); return; }
  if (action === "demo-audio-toggle") {
    const waveform = root.querySelector("[data-waveform]");
    const isPlaying = waveform?.classList.toggle("playing");
    actionTarget.innerHTML = `${renderIcon(isPlaying ? "Pause" : "Play", 14)}<span>${isPlaying ? "Пауза демо" : "Воспроизвести демо"}</span>`;
    return;
  }
  if (action === "demo-scan") {
    if (state.scanRunning) return;
    state.scanRunning = true;
    const button = actionTarget; const previous = button.innerHTML;
    const status = root.querySelector("[data-scan-status]");
    button.disabled = true; button.innerHTML = `${renderIcon("LoaderCircle", 14, "spin")}Сканирование…`;
    if (status) status.textContent = "Проверка демо-данных…";
    window.setTimeout(() => {
      state.scanRunning = false;
      if (!button.isConnected) return;
      button.disabled = false; button.innerHTML = previous;
      if (status) status.textContent = "Найдено 3 демонстрационных элемента";
      toast("Сканирование завершено");
    }, 850);
    return;
  }
  if (action === "demo-toggle-effect") {
    const preview = root.querySelector("[data-effect-preview]");
    const active = preview?.classList.toggle("active");
    actionTarget.innerHTML = `${renderIcon(active ? "EyeOff" : "Eye", 14)}${active ? "Скрыть превью" : "Показать превью"}`;
    return;
  }
  if (action === "demo-reset-effect") {
    root.querySelector("[data-effect-preview]")?.classList.remove("active");
    const button = root.querySelector('[data-action="demo-toggle-effect"]');
    if (button) button.innerHTML = `${renderIcon("Eye", 14)}Показать превью`;
    return;
  }
  if (action === "demo-step") {
    state.demoCounter += 1;
    const number = root.querySelector("#demo-count"); const label = root.querySelector("#model-state");
    if (number) number.textContent = String(state.demoCounter);
    if (label) label.textContent = `Состояние ${state.demoCounter}`;
    return;
  }
  if (action === "demo-save-note") {
    const content = root.querySelector("[data-note-editor]")?.value ?? "";
    writeStore(NOTES_KEY, content);
    const status = root.querySelector("#note-save-status");
    if (status) status.textContent = "Сохранено локально";
    toast("Черновик сохранён в браузере");
    return;
  }
  if (action === "demo-refresh-metrics") {
    const values = { CPU: `${32 + Math.floor(Math.random() * 26)}°`, ПАМЯТЬ: `${42 + Math.floor(Math.random() * 38)}%`, БАТАРЕЯ: `${70 + Math.floor(Math.random() * 26)}%` };
    Object.entries(values).forEach(([key, value]) => { const el = root.querySelector(`[data-metric-value="${key}"]`); if (el) el.textContent = value; });
    toast("Демо-показания обновлены"); return;
  }
});

root.addEventListener("input", (event) => {
  if (event.target.matches("[data-global-search]")) {
    state.query = event.target.value;
    if (state.activeAppId) { state.activeAppId = null; state.returnView = null; state.mode = "all"; state.categoryId = null; }
    const position = event.target.selectionStart;
    render({ focusSearch: true, cursor: { start: position, end: position } });
  }
});

root.addEventListener("change", (event) => {
  if (event.target.matches("[data-sort-select]")) {
    state.sort = event.target.value;
    render();
  }
  if (event.target.matches("[data-demo-zoom]")) {
    const preview = root.querySelector(".preview-window");
    if (preview) preview.style.transform = `scale(${Number(event.target.value) / 100})`;
  }
  if (event.target.matches("[data-task-toggle]")) event.target.closest(".task-row")?.classList.toggle("done", event.target.checked);
});

root.addEventListener("submit", (event) => {
  if (event.target.matches("[data-chat-form]")) {
    event.preventDefault();
    const input = event.target.elements.message;
    const message = input.value.trim();
    if (!message) return;
    addChatMessage(message);
    input.value = "";
    return;
  }
  if (event.target.matches("[data-task-form]")) {
    event.preventDefault();
    const input = event.target.elements.task;
    const task = input.value.trim();
    if (!task) return;
    state.taskRows = [task, ...state.taskRows].slice(0, 8);
    writeStore(TASKS_KEY, state.taskRows);
    const app = currentApp();
    if (app) { render(); toast("Задача добавлена"); }
    return;
  }
  if (event.target.matches("[data-terminal-form]")) {
    event.preventDefault();
    const input = event.target.elements.command;
    const command = input.value.trim() || "help";
    const terminal = root.querySelector("[data-terminal-output]");
    const line = document.createElement("div"); line.className = "terminal-line";
    const prompt = document.createElement("span"); prompt.textContent = "byazen $ ";
    line.append(prompt, document.createTextNode(command));
    const output = document.createElement("div"); output.className = "terminal-output";
    output.textContent = command.toLowerCase() === "help" ? "Доступно в демо: help, status, clear" : command.toLowerCase() === "status" ? "Изолированная демо-среда · команды ОС не выполняются." : command.toLowerCase() === "clear" ? "Вывод очищен. Введите help." : "Команда показана как макет и не запускалась.";
    if (terminal) { terminal.append(line, output); terminal.scrollTop = terminal.scrollHeight; }
    input.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  const isCommand = event.metaKey || event.ctrlKey;
  const overlayOpen = state.infoAppId !== null || state.contextAppId !== null;
  if (isCommand && event.key.toLowerCase() === "k" && !overlayOpen) {
    event.preventDefault();
    const input = root.querySelector("[data-global-search]");
    if (input) { input.focus(); input.select(); }
    return;
  }
  if (event.key === "/" && !overlayOpen && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    root.querySelector("[data-global-search]")?.focus();
  }
  if (event.key === "Escape") {
    if (state.infoAppId !== null) { state.infoAppId = null; render(); return; }
    if (state.contextAppId !== null) { state.contextAppId = null; state.contextPosition = null; render(); return; }
    if (state.activeAppId) { backToLibrary(); }
    else if (state.query) { state.query = ""; render({ focusSearch: true, cursor: { start: 0, end: 0 } }); }
  }
  if (state.contextAppId !== null && event.key.toLowerCase() === "i") {
    event.preventDefault();
    state.infoAppId = state.contextAppId;
    state.contextAppId = null;
    state.contextPosition = null;
    render();
    return;
  }
  if (state.infoAppId !== null && event.key === "Tab") {
    const dialog = root.querySelector(".app-info-dialog");
    const controls = [...(dialog?.querySelectorAll('button:not(:disabled)') ?? [])];
    if (controls.length) {
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  if (event.key === "Enter" && document.activeElement?.matches("[data-global-search]")) {
    const first = getVisibleApps()[0];
    if (first) openApp(first.id);
  }
});

render();
