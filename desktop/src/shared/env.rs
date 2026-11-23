use std::path::PathBuf;

/// Environment variable that overrides the data directory.
pub const DATA_DIR_VAR: &str = "PROCHECK_DATA_DIR";
/// Marker file placed next to the exe to enable portable mode.
pub const PORTABLE_MARKER: &str = "portable.txt";

const WEBVIEW_DATA_VAR: &str = "WEBVIEW2_USER_DATA_FOLDER";

/// Directory containing the running executable.
fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(PathBuf::from)
}

/// `<exe dir>/data` when `portable.txt` sits next to the exe.
pub fn portable_data_dir() -> Option<PathBuf> {
    let dir = exe_dir()?;
    dir.join(PORTABLE_MARKER).is_file().then(|| dir.join("data"))
}

/// Data directory from `PROCHECK_DATA_DIR` or portable mode; `None` means use the OS default.
pub fn data_dir_override() -> Option<PathBuf> {
    std::env::var_os(DATA_DIR_VAR)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(portable_data_dir)
}

/// In portable mode, keeps WebView2 data next to the exe. Call before Tauri starts.
pub fn prepare_portable_webview() {
    if std::env::var_os(DATA_DIR_VAR).is_some_and(|v| !v.is_empty()) {
        return;
    }
    if let Some(data) = portable_data_dir() {
        // SAFETY: called at startup before any other thread is spawned.
        unsafe { std::env::set_var(WEBVIEW_DATA_VAR, data.join("webview")) };
    }
}
