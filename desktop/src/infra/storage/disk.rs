use std::fs;
use std::path::Path;

/// Total size in bytes of a file, or of every file under a directory (symlinks are not followed).
/// Unreadable entries count as zero; a missing path is `None`.
pub fn size_of(path: &Path) -> Option<u64> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_dir() {
        return Some(meta.len());
    }
    let mut total = 0;
    let mut stack = vec![path.to_owned()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_files_recursively() {
        let dir = std::env::temp_dir().join(format!("procheck-disk-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a/b")).unwrap();
        fs::write(dir.join("one.txt"), "12345").unwrap();
        fs::write(dir.join("a/b/two.txt"), "123").unwrap();

        assert_eq!(size_of(&dir), Some(8));
        assert_eq!(size_of(&dir.join("one.txt")), Some(5));
        assert_eq!(size_of(&dir.join("missing")), None);
        fs::remove_dir_all(dir).unwrap();
    }
}
