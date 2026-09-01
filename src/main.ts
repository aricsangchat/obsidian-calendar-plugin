import type { Moment, WeekSpec } from "moment";
import { App, Notice, Plugin, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_CALENDAR } from "./constants";
import { settings } from "./ui/stores";
import {
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
} from "./settings";
import CalendarView from "./view";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  private view: CalendarView;

  onunload(): void {
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
  }

  async onload(): Promise<void> {
    this.register(
      settings.subscribe((value) => {
        this.options = value;
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf))
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        this.withView((view) =>
          view.openOrCreateWeeklyNote(window.moment(), false)
        );
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => this.withView((view) => view.revealActiveNote()),
    });

    await this.loadOptions();

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    // `layout-ready` is no longer in the public Workspace event map. It still
    // fires at runtime on 1.13.7 (verified), so this is hardening rather than a
    // bug fix — but it is undocumented and can be dropped without notice.
    // onLayoutReady is the supported API and fires immediately when the layout
    // is already ready, which covers both the cold- and warm-start paths.
    this.app.workspace.onLayoutReady(() => this.initLeaf());
  }

  /**
   * Run `fn` against the calendar view, creating the leaf first if it isn't
   * open yet.
   *
   * `this.view` is only assigned when the view factory runs, so any command
   * that dereferenced it directly threw for users who had closed the calendar
   * pane — or for everyone, on a cold start, before #417 was fixed. Recreating
   * the leaf on demand makes the commands work from a cold palette.
   */
  private async withView(fn: (view: CalendarView) => unknown): Promise<void> {
    if (!this.view) {
      this.initLeaf();
      await this.app.workspace.revealLeaf(
        this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0]
      );
    }
    if (this.view) {
      fn(this.view);
    }
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    this.app.workspace.getRightLeaf(false).setViewState({
      type: VIEW_TYPE_CALENDAR,
    });
  }

  /**
   * Settings written by the original `calendar` plugin.
   *
   * The community plugin list requires a unique id, so this fork ships as
   * `calendar-revived` and Obsidian gives it a fresh settings file. Without
   * this, anyone switching over silently loses their configuration. Read the
   * old file once, on first run only, and never write to it.
   */
  private async loadLegacyOptions(): Promise<Partial<ISettings> | null> {
    const legacyPath = `${this.app.vault.configDir}/plugins/calendar/data.json`;
    try {
      if (!(await this.app.vault.adapter.exists(legacyPath))) {
        return null;
      }
      const parsed = JSON.parse(await this.app.vault.adapter.read(legacyPath));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) {
      // Never let a malformed or unreadable legacy file block startup.
      console.warn("[Calendar Revived] could not import previous settings", err);
      return null;
    }
  }

  async loadOptions(): Promise<void> {
    let options = await this.loadData();

    if (!options) {
      const legacy = await this.loadLegacyOptions();
      if (legacy) {
        options = legacy;
        new Notice("Calendar: imported your settings from the original plugin.");
      }
    }

    settings.update((old) => {
      return {
        ...old,
        ...(options || {}),
      };
    });

    await this.saveData(this.options);
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
  }
}
