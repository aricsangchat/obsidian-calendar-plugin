import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

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

    // `layout-ready` was removed from the Workspace event map; registering for
    // it silently never fired, so on a cold start (where layoutReady is still
    // false during onload) the view was never constructed and every command
    // that touches `this.view` threw. onLayoutReady is the supported API and
    // fires immediately if the layout is already ready. See #417.
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

  async loadOptions(): Promise<void> {
    const options = await this.loadData();
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
