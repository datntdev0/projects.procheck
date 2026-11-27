//! Downloads one tool into a `.part` file that a later attempt resumes with an HTTP Range request.
//! The sha256 of the whole file is checked once it is complete (`verify`), which also covers a resumed
//! download. Each URL of the manifest is tried in turn.
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};
use ureq::Agent;
use ureq::Body;
use ureq::http::Response;

use super::manifest::ManifestItem;
use super::models::{ToolError, ToolErrorCode};

const CHUNK_SIZE: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const PART_SUFFIX: &str = ".part";
const USER_AGENT: &str = "Procheck-Setup";
const STATUS_OK: u16 = 200;
const STATUS_PARTIAL: u16 = 206;
const STATUS_RANGE_INVALID: u16 = 416;

#[derive(Debug, PartialEq, Eq)]
pub enum FetchStop {
    Cancelled,
    Failed(ToolError),
}

/// One download: the manifest item, the folder it goes to and the flag that cancels it.
pub struct Fetch<'a> {
    pub item: &'a ManifestItem,
    pub directory: &'a Path,
    pub cancel: &'a AtomicBool,
}

impl Fetch<'_> {
    pub fn archive(&self) -> PathBuf {
        self.directory.join(&self.item.file)
    }

    fn part(&self) -> PathBuf {
        self.directory.join(format!("{}{PART_SUFFIX}", self.item.file))
    }

    /// Bytes already on disk.
    pub fn received(&self) -> u64 {
        if self.archive().is_file() {
            return self.item.size;
        }
        file_len(&self.part())
    }

    /// Downloads the file (or finishes a partial one), reporting the bytes received so far.
    pub fn download(&self, progress: &mut dyn FnMut(u64)) -> Result<(), FetchStop> {
        if self.archive().is_file() {
            return Ok(());
        }
        fs::create_dir_all(self.directory).map_err(|e| failed(ToolError::io(&e)))?;
        let mut last = None;
        for url in &self.item.urls {
            match self.download_from(url, progress) {
                Ok(()) => return Ok(()),
                Err(FetchStop::Cancelled) => return Err(FetchStop::Cancelled),
                Err(FetchStop::Failed(error)) => {
                    log::warn!("downloading {} from {url} failed: {error}", self.item.file);
                    last = Some(error);
                }
            }
        }
        Err(failed(last.unwrap_or_else(|| network("no download url is configured".into()))))
    }

    /// Checks the sha256 of the downloaded file and moves it to its final name. A file with the
    /// wrong hash is deleted, so the next attempt downloads it again.
    pub fn verify(&self) -> Result<PathBuf, ToolError> {
        let archive = self.archive();
        let source = if archive.is_file() { archive.clone() } else { self.part() };
        let digest = hash_file(&source).map_err(|e| ToolError::io(&e))?;
        if !digest.eq_ignore_ascii_case(&self.item.sha256) {
            let _ = fs::remove_file(&source);
            return Err(ToolError::new(
                ToolErrorCode::Checksum,
                format!("{} has sha256 {digest}, expected {}", self.item.file, self.item.sha256),
            ));
        }
        if source != archive {
            fs::rename(&source, &archive).map_err(|e| ToolError::io(&e))?;
        }
        Ok(archive)
    }

    fn download_from(&self, url: &str, progress: &mut dyn FnMut(u64)) -> Result<(), FetchStop> {
        let part = self.part();
        let offset = file_len(&part);
        if offset >= self.item.size {
            return Ok(());
        }
        let response = request(url, offset).map_err(|e| failed(network(e.to_string())))?;
        let (file, start) = match response.status().as_u16() {
            STATUS_PARTIAL => (open_part(&part, true)?, offset),
            STATUS_OK => (open_part(&part, false)?, 0),
            STATUS_RANGE_INVALID => {
                let _ = fs::remove_file(&part);
                return Err(failed(network(format!("{url} rejected the resume range"))));
            }
            other => return Err(failed(network(format!("{url} answered HTTP {other}")))),
        };
        self.stream(response, file, start, progress)
    }

    fn stream(&self, response: Response<Body>, mut file: File, start: u64, progress: &mut dyn FnMut(u64)) -> Result<(), FetchStop> {
        let mut reader = response.into_body().into_with_config().limit(u64::MAX).reader();
        let mut received = start;
        let mut buffer = vec![0u8; CHUNK_SIZE];
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return Err(FetchStop::Cancelled);
            }
            let count = reader.read(&mut buffer).map_err(|e| failed(network(e.to_string())))?;
            if count == 0 {
                break;
            }
            file.write_all(&buffer[..count]).map_err(|e| failed(ToolError::io(&e)))?;
            received += count as u64;
            progress(received);
        }
        file.flush().map_err(|e| failed(ToolError::io(&e)))?;
        if received < self.item.size {
            return Err(failed(network(format!("the download ended early at {received} of {} bytes", self.item.size))));
        }
        Ok(())
    }
}

/// A GET request, from `offset` when resuming.
fn request(url: &str, offset: u64) -> Result<Response<Body>, ureq::Error> {
    let config = Agent::config_builder()
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .timeout_recv_response(Some(RESPONSE_TIMEOUT))
        .http_status_as_error(false)
        .user_agent(USER_AGENT)
        .build();
    let mut request = Agent::new_with_config(config).get(url);
    if offset > 0 {
        request = request.header("Range", format!("bytes={offset}-"));
    }
    request.call()
}

fn open_part(path: &Path, append: bool) -> Result<File, FetchStop> {
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }
    options.open(path).map_err(|e| failed(ToolError::io(&e)))
}

fn network(detail: String) -> ToolError {
    ToolError::new(ToolErrorCode::Network, detail)
}

fn failed(error: ToolError) -> FetchStop {
    FetchStop::Failed(error)
}

fn file_len(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK_SIZE];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}
