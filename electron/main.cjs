const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isPackaged = app.isPackaged;
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
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  let startupTimeout;
  try {
    const ready = async () => {
      await window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
      const cardCount = await window.webContents.executeJavaScript(
        'document.querySelectorAll("#app .app-card").length',
      );
      if (!cardCount || (smokeDir && cardCount !== 185)) {
        throw new Error(`Каталог не загрузился (карточек: ${cardCount}).`);
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
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(startupFailed);
  });
  return createWindow();
}).catch(startupFailed);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
