//! Opening a project folder in Visual Studio Code.
use std::io;
use std::path::Path;

use crate::infra::process;

const CLI: &str = "code";

/// Starts VS Code on `folder` through its `code` command. `false` when `code` is not on PATH.
pub fn open_with_cli(folder: &Path) -> io::Result<bool> {
    let Some(cli) = process::find_on_path(CLI) else {
        return Ok(false);
    };
    process::launch_detached(&cli, [folder.as_os_str()])?;
    Ok(true)
}

/// Starts VS Code on `folder` with `file` open in it. `false` when `code` is not on PATH.
pub fn open_file_with_cli(folder: &Path, file: &Path) -> io::Result<bool> {
    let Some(cli) = process::find_on_path(CLI) else {
        return Ok(false);
    };
    process::launch_detached(&cli, [folder.as_os_str(), file.as_os_str()])?;
    Ok(true)
}

/// `vscode://file/D:/src/my%20app`: the URL VS Code registers with the OS, used when `code` is not on PATH.
pub fn protocol_url(folder: &Path) -> String {
    let path = folder.display().to_string().replace('\\', "/");
    let mut url = String::from("vscode://file/");
    for c in path.trim_start_matches('/').chars() {
        match c {
            ' ' => url.push_str("%20"),
            '#' => url.push_str("%23"),
            '%' => url.push_str("%25"),
            '?' => url.push_str("%3F"),
            _ => url.push(c),
        }
    }
    url
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_url_uses_forward_slashes_and_escapes_reserved_characters() {
        assert_eq!(protocol_url(Path::new("D:\\src\\my app #1")), "vscode://file/D:/src/my%20app%20%231");
    }
}
