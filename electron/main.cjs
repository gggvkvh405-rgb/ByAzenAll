const { app, BrowserWindow, Menu, dialog, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isPackaged = app.isPackaged;
const uiDir = isPackaged ? path.join(process.resourcesPath, "ui") : path.join(app.getAppPath(), "dist");
const uiUrl = "byazen://app/index.html";

// Use a local origin so Chromium need not navigate to a file:// URL inside app.asar.
protocol.registerSchemesAsPrivileged([{
  scheme: "byazen",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

const uiTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveUi(request) {
  const { host, pathname } = new URL(request.url);
  const entry = pathname === "/index.html" || pathname === "/favicon.svg";
  const asset = /^\/assets\/[\w-]+\.(?:js|css)$/.test(pathname);
  if (request.method !== "GET" || host !== "app" || (!entry && !asset)) {
    return new Response(null, { status: 404 });
  }

  try {
    const content = await fs.promises.readFile(path.join(uiDir, pathname.slice(1)));
    return new Response(content, { headers: { "Content-Type": uiTypes[path.extname(pathname)] } });
  } catch (error) {
    console.error(`Не удалось прочитать ресурс ${pathname}:`, error);
    return new Response(null, { status: error.code === "ENOENT" ? 404 : 500 });
  }
}

const appIcon = isPackaged
  ? path.join(process.resourcesPath, "ByAzen.ico")
  : path.join(__dirname, "..", "public", "ByAzen.ico");

// The Windows build tests the actual packaged executable with a fresh profile.
const smokeDir = process.argv.includes("--byazen-smoke-test") && process.env.BYAZEN_SMOKE_DIR;
if (smokeDir) app.setPath("userData", smokeDir);

function startupFailed(error) {
  if (smokeDir) {
    fs.writeFileSync(path.join(smokeDir, "startup.txt"), String(error));
  } else {
    dialog.showErrorBox("ByAzen не удалось запустить", String(error));
  }
  app.exit(1);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "ByAzen",
    backgroundColor: "#111310",
    autoHideMenuBar: true,
    ...(fs.existsSync(appIcon) ? { icon: appIcon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  let startupTimeout;
  try {
    const ready = async () => {
      await fs.promises.access(path.join(uiDir, "index.html"), fs.constants.R_OK);
      await window.loadURL(uiUrl);
      const { cardCount, styled } = await window.webContents.executeJavaScript(`(() => {
        const frame = document.querySelector('#app .app-frame');
        return {
          cardCount: document.querySelectorAll('#app .app-card').length,
          styled: frame !== null && getComputedStyle(frame).display === 'grid',
        };
      })()`);
      if (!cardCount || (smokeDir && (cardCount !== 185 || !styled))) {
        throw new Error(`Каталог не загрузился (карточек: ${cardCount}, стили: ${styled ? "да" : "нет"}).`);
      }
    };
    await Promise.race([
      ready(),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(() => reject(new Error("Превышено время загрузки каталога.")), 30000);
      }),
    ]);
    window.show();
    if (smokeDir) {
      if (!window.isVisible()) throw new Error("Окно не отображается.");
      fs.writeFileSync(path.join(smokeDir, "startup.txt"), "OK");
      app.exit(0);
    }
  } finally {
    clearTimeout(startupTimeout);
  }
}

app.whenReady().then(() => {
  app.setName("ByAzen");
  Menu.setApplicationMenu(null);
  protocol.handle("byazen", serveUi);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(startupFailed);
  });
  return createWindow();
}).catch(startupFailed);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
