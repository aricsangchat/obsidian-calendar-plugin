/**
 * Cold-start harness for issue #417.
 *
 * Loads the real built `main.js` against a simulated Obsidian API and
 * reproduces the exact conditions from the bug report:
 *
 *   - Obsidian display language set to French
 *   - a genuine cold start, i.e. workspace.layoutReady === false during onload
 *   - moment's locale data not yet carrying `_week`, so
 *     `window._bundledLocaleWeekSpec` is left undefined
 *
 * Then asserts the three things the report says are broken:
 *   1. the settings tab renders without throwing
 *   2. the calendar view is actually constructed
 *   3. the commands run instead of throwing on an undefined `this.view`
 *
 * Run: node harness/coldstart.js
 */
const Module = require("module");
const path = require("path");
const assert = require("assert");

const COLD_START = process.env.LAYOUT_READY !== "1";
const LOCALE = process.env.LOCALE || "fr";

/* ---------- simulated Obsidian API ---------- */

class Events {
  constructor() {
    this._handlers = {};
  }
  on(name, cb) {
    (this._handlers[name] = this._handlers[name] || []).push(cb);
    return { name };
  }
  trigger(name, ...args) {
    (this._handlers[name] || []).forEach((cb) => cb(...args));
  }
}

class Workspace extends Events {
  constructor() {
    super();
    this.layoutReady = !COLD_START;
    this._leaves = [];
    this._layoutReadyCallbacks = [];
    this.viewFactories = {};
  }
  // The supported API. Fires immediately when the layout is already ready.
  onLayoutReady(cb) {
    if (this.layoutReady) cb();
    else this._layoutReadyCallbacks.push(cb);
  }
  // What Obsidian does once the workspace finishes restoring.
  _completeLayout() {
    this.layoutReady = true;
    this._layoutReadyCallbacks.splice(0).forEach((cb) => cb());
  }
  getLeavesOfType(type) {
    return this._leaves.filter((l) => l.viewType === type);
  }
  getRightLeaf() {
    const leaf = {
      app: this.app,
      viewType: null,
      view: null,
      setViewState: ({ type }) => {
        leaf.viewType = type;
        const factory = this.viewFactories[type];
        if (factory) leaf.view = factory(leaf);
        return Promise.resolve();
      },
      openFile: () => Promise.resolve(),
      getViewState: () => ({ type: leaf.viewType }),
    };
    this._leaves.push(leaf);
    return leaf;
  }
  revealLeaf() {
    return Promise.resolve();
  }
  getActiveFile() {
    return null;
  }
  splitActiveLeaf() {
    return this.getRightLeaf();
  }
  getUnpinnedLeaf() {
    return this.getRightLeaf();
  }
}

const el = () => {
  const node = {
    children: [],
    empty() {
      node.children = [];
      return node;
    },
    createDiv(_cls, cb) {
      const c = el();
      node.children.push(c);
      if (cb) cb(c);
      return c;
    },
    createEl(_tag, _o) {
      const c = el();
      node.children.push(c);
      return c;
    },
    addClass: () => node,
    setText: () => node,
    appendChild: () => node,
    style: {},
    addEventListener: () => {},
  };
  return node;
};

class Setting {
  constructor() {
    this.settingEl = el();
  }
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText(cb) {
    cb({
      setPlaceholder: function () {
        return this;
      },
      setValue: function () {
        return this;
      },
      onChange: function () {
        return this;
      },
      inputEl: {},
    });
    return this;
  }
  addToggle(cb) {
    cb({
      setValue: function () {
        return this;
      },
      onChange: function () {
        return this;
      },
    });
    return this;
  }
  addDropdown(cb) {
    cb({
      addOption: function () {
        return this;
      },
      setValue: function () {
        return this;
      },
      onChange: function () {
        return this;
      },
    });
    return this;
  }
}

class PluginSettingTab {
  constructor(app) {
    this.app = app;
    this.containerEl = el();
  }
}

class Plugin {
  constructor(app) {
    this.app = app;
    this.commands = {};
    this._data = {};
  }
  addCommand(c) {
    this.commands[c.id] = c;
  }
  addSettingTab(t) {
    this.settingTab = t;
  }
  registerView(type, factory) {
    this.app.workspace.viewFactories[type] = factory;
  }
  registerEvent() {}
  registerInterval() {}
  register() {}
  addRibbonIcon() {
    return el();
  }
  loadData() {
    return Promise.resolve(this._data);
  }
  saveData(d) {
    this._data = d;
    return Promise.resolve();
  }
}

class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.containerEl = el();
    this.contentEl = el();
    this.app = leaf.app;
  }
  registerEvent() {}
  registerInterval() {}
  register() {}
}

const obsidianStub = {
  App: class {},
  Plugin,
  PluginSettingTab,
  Setting,
  ItemView,
  Menu: class {
    addItem(cb) {
      cb({
        setTitle: function () {
          return this;
        },
        setIcon: function () {
          return this;
        },
        onClick: function () {
          return this;
        },
      });
      return this;
    }
    showAtPosition() {}
  },
  TFile: class {},
  Modal: class {
    constructor(app) {
      this.app = app;
      this.contentEl = el();
      this.titleEl = el();
      this.modalEl = el();
    }
    open() {}
    close() {}
  },
  Notice: class {},
  WorkspaceLeaf: class {},
  Keymap: { isModifier: () => false },
  Platform: { isMobile: false },
  debounce: (fn) => fn,
  normalizePath: (p) => p,
};

/* ---------- module interception ---------- */

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian";
  return realResolve.call(this, request, ...rest);
};
require.cache["obsidian"] = { id: "obsidian", exports: obsidianStub, loaded: true };

/* ---------- global environment ---------- */

const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

const moment = require("moment");
require("moment/locale/fr");

global.localStorage = {
  _s: { language: LOCALE },
  getItem(k) {
    return this._s[k] ?? null;
  },
  setItem(k, v) {
    this._s[k] = v;
  },
};
window.localStorage = global.localStorage;

/**
 * Reproduce the cold-start defect precisely.
 *
 * Upstream does `window._bundledLocaleWeekSpec = moment.localeData()._week`.
 * On a cold start with a non-English locale that property isn't populated
 * yet, so the global is assigned `undefined` with no error at the write site.
 */
const localeDataProto = Object.getPrototypeOf(moment.localeData());
if (COLD_START) {
  Object.defineProperty(localeDataProto, "_week", {
    configurable: true,
    get() {
      return undefined;
    },
  });
}
moment.locale(LOCALE);
window.moment = moment;
global.moment = moment;

class Vault extends Events {
  getConfig() {
    return "source";
  }
  getAbstractFileByPath() {
    return null;
  }
  getMarkdownFiles() {
    return [];
  }
  getAllLoadedFiles() {
    return [];
  }
  read() {
    return Promise.resolve("");
  }
  cachedRead() {
    return Promise.resolve("");
  }
}

const app = { workspace: new Workspace(), vault: new Vault() };
app.metadataCache = new Events();
app.workspace.app = app;
window.app = app;
app.plugins = { getPlugin: () => null };
// obsidian-daily-notes-interface reads app.internalPlugins.plugins["daily-notes"]
app.internalPlugins = {
  plugins: {
    "daily-notes": {
      enabled: true,
      instance: { options: { folder: "daily", format: "YYYY-MM-DD" } },
    },
  },
  getPluginById: (id) => app.internalPlugins.plugins[id],
};

/* ---------- run ---------- */

(async () => {
  console.log(
    `scenario: locale=${LOCALE} coldStart=${COLD_START} ` +
      `(layoutReady during onload = ${!COLD_START})`
  );

  const CalendarPlugin = require(path.join(__dirname, "..", "main.js"));
  const plugin = new CalendarPlugin(app);
  plugin.app = app;

  const results = [];
  const check = (name, fn) => {
    try {
      fn();
      results.push([true, name, ""]);
    } catch (e) {
      results.push([false, name, `${e.constructor.name}: ${e.message}`]);
    }
  };

  await plugin.onload();
  // Obsidian finishes restoring the workspace after plugins have loaded.
  if (COLD_START) app.workspace._completeLayout();

  check("settings tab renders", () => plugin.settingTab.display());
  check("calendar view was constructed", () =>
    assert.ok(
      app.workspace.getLeavesOfType("calendar").length > 0,
      "no calendar leaf was created"
    )
  );
  check("command: open-weekly-note", () =>
    plugin.commands["open-weekly-note"].checkCallback(false)
  );
  check("command: reveal-active-note", () =>
    plugin.commands["reveal-active-note"].callback()
  );

  let failed = 0;
  for (const [ok, name, err] of results) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${err ? "  -> " + err : ""}`);
    if (!ok) failed++;
  }
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
