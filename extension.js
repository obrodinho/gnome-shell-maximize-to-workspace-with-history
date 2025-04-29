import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class MaximizeToWorkspaceExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._windowManagerHandles = [];
        this._oldWorkspaces = {};
        this._fullScreenApps = {};
        this._debounceTimers = new Map(); // Map to store debounce timers for windows
    }

    // Change the workspace of the window to the provided index
    _changeWorkspace(win, manager, index) {
        const n = manager.get_n_workspaces();
        if (n <= index) {
            log(`Workspace index ${index} out of bounds.`);
            return;
        }

        if (win.get_workspace().index() === index) {
            log(`Window ${win.get_title()} (${win.get_id()}) is already on workspace ${index}.`);
            return; // Skip if already on the target workspace
        }

        log(`Moving window ${win.get_title()} (${win.get_id()}) to workspace ${index}.`);
        const timestamp = GLib.get_monotonic_time() / 1000; // Use reliable timestamp
        win.change_workspace_by_index(index, 1);
        manager.get_workspace_by_index(index).activate(timestamp);
    }

    // Get the index of the first empty workspace available for a window
    _firstEmptyWorkspaceIndex(manager, win) {
        const n = manager.get_n_workspaces();
        let lastWorkspace = n - 1;

        for (let i = 0; i < lastWorkspace; ++i) {
            let winCount = manager.get_workspace_by_index(i)
                .list_windows()
                .filter(w => !w.is_always_on_all_workspaces() && win.get_monitor() === w.get_monitor()).length;
            if (winCount < 1) {
                log(`Found empty workspace ${i} for window ${win.get_title()} (${win.get_id()}).`);
                return i;
            }
        }

        // Return last workspace by default, but start with 1 to avoid programming bugs
        if (lastWorkspace < 1) lastWorkspace = 1;
        log(`Returning last workspace ${lastWorkspace} for window ${win.get_title()} (${win.get_id()}).`);
        return lastWorkspace;
    }

    // Handle maximize/unmaximize/fullscreen events for windows
    _handleWindowStateChange(win, change) {
        const workspaceManager = win.get_display().get_workspace_manager();

        // Ensure the window is normal
        if (win.window_type !== Meta.WindowType.NORMAL) {
            log(`Ignoring non-normal window ${win.get_title()} (${win.get_id()}).`);
            return;
        }

        const name = win.get_id();
        const otherWindows = win.get_workspace().list_windows()
            .filter(w => w !== win && !w.is_always_on_all_workspaces() && win.get_monitor() === w.get_monitor());

        // Handle unmaximize or unfullscreen events
        if (change === Meta.SizeChange.UNFULLSCREEN || change === Meta.SizeChange.UNMAXIMIZE ||
            (change === Meta.SizeChange.MAXIMIZE && win.get_maximized() !== Meta.MaximizeFlags.BOTH)) {

            // Handle fullscreen apps
            if (this._fullScreenApps[name] !== undefined) {
                if (otherWindows.length === 0) {
                    this._changeWorkspace(win, workspaceManager, this._fullScreenApps[name]);
                }
                delete this._fullScreenApps[name];
                log(`Restored workspace for fullscreen app ${win.get_title()} (${win.get_id()}).`);
                return;
            }

            // Handle unmaximize events
            if (this._oldWorkspaces[name] !== undefined) {
                if (otherWindows.length === 0) {
                    this._changeWorkspace(win, workspaceManager, this._oldWorkspaces[name]);
                }
                delete this._oldWorkspaces[name];
                log(`Restored workspace for unmaximized window ${win.get_title()} (${win.get_id()}).`);
            }
            return;
        }

        // Save window state for fullscreen and maximize
        if (change === Meta.SizeChange.FULLSCREEN) {
            this._fullScreenApps[name] = win.get_workspace().index();
        } else {
            this._oldWorkspaces[name] = win.get_workspace().index();
        }

        // Move to an empty workspace if needed
        if (otherWindows.length >= 1) {
            let emptyWorkspace = this._firstEmptyWorkspaceIndex(workspaceManager, win);

            // Don't move if already on the target workspace
            if (emptyWorkspace === win.get_workspace().index()) {
                return;
            }

            this._changeWorkspace(win, workspaceManager, emptyWorkspace);
        }
    }

    // Handle window close events and return to the original workspace
    _handleWindowClose(act) {
        let win = act.meta_window;
        let name = win.get_id();
        if (this._oldWorkspaces[name] !== undefined) {
            const timestamp = GLib.get_monotonic_time() / 1000; // Use reliable timestamp
            win.get_display().get_workspace_manager().get_workspace_by_index(this._oldWorkspaces[name]).activate(timestamp);
            log(`Restored original workspace for closed window ${win.get_title()} (${win.get_id()}).`);
        }
    }

    // Debounce frequent events to avoid lag
    _debouncedCheck(win, change, delay = 100) {
        const id = win.get_id();

        if (this._debounceTimers.has(id)) {
            GLib.Source.remove(this._debounceTimers.get(id));
        }

        const timerId = GLib.timeout_add(GLib.PRIORITY_LOW, delay, () => {
            this._handleWindowStateChange(win, change);
            this._debounceTimers.delete(id); // Clear the timer after execution
            return GLib.SOURCE_REMOVE;
        });

        this._debounceTimers.set(id, timerId);
    }

    enable() {
        // Connect to window manager signals
        this._windowManagerHandles.push(global.window_manager.connect('map', (_, act, change) => {
            if (act.meta_window.get_maximized() === Meta.MaximizeFlags.BOTH) {
                this._debouncedCheck(act.meta_window, change);
            }
        }));

        this._windowManagerHandles.push(global.window_manager.connect('size-change', (_, act, change) => {
            this._debouncedCheck(act.meta_window, change, 150); // Slightly increased delay for size-change
        }));

        this._windowManagerHandles.push(global.window_manager.connect('destroy', (_, act) => {
            this._handleWindowClose(act);
        }));

        log('MaximizeToWorkspaceExtension enabled.');
    }

    disable() {
        // Disconnect all connected signals
        this._windowManagerHandles.splice(0).forEach(h => global.window_manager.disconnect(h));

        // Clear all debounce timers
        for (let timerId of this._debounceTimers.values()) {
            GLib.Source.remove(timerId);
        }
        this._debounceTimers.clear();

        log('MaximizeToWorkspaceExtension disabled.');
    }
}