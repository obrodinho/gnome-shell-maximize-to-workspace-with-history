import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MaximizeToWorkspaceExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._windowManagerHandles = [];
        this._oldWorkspaces = {};
        this._fullScreenApps = {};
    }

    _changeWorkspace(win, manager, index) {
        const n = manager.get_n_workspaces();
        if (n <= index) {
            return;
        }
        win.change_workspace_by_index(index, 1);
        manager.get_workspace_by_index(index).activate(global.get_current_time());
    }

    _firstEmptyWorkspaceIndex(manager, win) {
        const n = manager.get_n_workspaces();
        let lastWorkspace = n - 1;
        for (let i = 0; i < lastWorkspace; ++i) {
            let winCount = manager.get_workspace_by_index(i)
                .list_windows()
                .filter(w => !w.is_always_on_all_workspaces() && win.get_monitor() === w.get_monitor()).length;
            if (winCount < 1) {
                return i;
            }
        }
        // Return last workspace by default
        if (lastWorkspace < 1) lastWorkspace = 1;
        return lastWorkspace;
    }

    _check(win, change) {
        const workspaceManager = win.get_display().get_workspace_manager();

        if (win.window_type !== Meta.WindowType.NORMAL) {
            return;
        }

        const name = win.get_id();
        const windows = win.get_workspace().list_windows()
            .filter(w => w !== win && !w.is_always_on_all_workspaces() && win.get_monitor() === w.get_monitor());

        if (change === Meta.SizeChange.UNFULLSCREEN || change === Meta.SizeChange.UNMAXIMIZE || (change === Meta.SizeChange.MAXIMIZE && win.get_maximized() !== Meta.MaximizeFlags.BOTH)) {
            if (this._fullScreenApps[name] !== undefined) {
                if (windows.length === 0) {
                    this._changeWorkspace(win, workspaceManager, this._fullScreenApps[name]);
                }
                delete this._fullScreenApps[name];
                return;
            }

            if (this._oldWorkspaces[name] !== undefined) {
                if (windows.length === 0) {
                    this._changeWorkspace(win, workspaceManager, this._oldWorkspaces[name]);
                }
                delete this._oldWorkspaces[name];
            }
            return;
        }

        if (change === Meta.SizeChange.FULLSCREEN) {
            this._fullScreenApps[name] = win.get_workspace().index();
        } else {
            this._oldWorkspaces[name] = win.get_workspace().index();
        }

        if (windows.length >= 1) {
            let emptyWorkspace = this._firstEmptyWorkspaceIndex(workspaceManager, win);

            if (emptyWorkspace === win.get_workspace().index()) {
                return;
            }

            this._changeWorkspace(win, workspaceManager, emptyWorkspace);
        }
    }

    _handleWindowClose(act) {
        let win = act.meta_window;
        let name = win.get_id();
        if (this._oldWorkspaces[name] !== undefined) {
            win.get_display().get_workspace_manager().get_workspace_by_index(this._oldWorkspaces[name]).activate(global.get_current_time());
        }
    }

    enable() {
        this._windowManagerHandles.push(global.window_manager.connect('map', (_, act, change) => {
            if (act.meta_window.get_maximized() === Meta.MaximizeFlags.BOTH) {
                this._check(act.meta_window, change);
            }
        }));

        this._windowManagerHandles.push(global.window_manager.connect('size-change', (_, act, change) => {
            GLib.timeout_add(GLib.PRIORITY_LOW, 300, this._check.bind(this, act.meta_window, change));
        }));

        this._windowManagerHandles.push(global.window_manager.connect('destroy', (_, act) => {
            this._handleWindowClose(act);
        }));
    }

    disable() {
        this._windowManagerHandles.splice(0).forEach(h => global.window_manager.disconnect(h));
    }
}