//! `chats\index.json` lists every chat; `chats\<id>.jsonl` holds its messages, one per line,
//! appended as they happen so a crash never loses earlier messages.
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use super::{ChatMessage, ChatSummary, UsageLimits, now};
use crate::features::agents::AgentId;
use crate::infra::storage::{StorageError, StorageResult, json_file};

const INDEX_FILE: &str = "index.json";
const LIMITS_FILE: &str = "limits.json";
const INDEX_VERSION: u32 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ChatIndex {
    version: u32,
    chats: Vec<ChatSummary>,
}

#[derive(Debug)]
pub enum ChatStoreError {
    NotFound(String),
    Storage(StorageError),
}

impl ChatStoreError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "notFound",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for ChatStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(id) => write!(f, "chat not found: {id}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ChatStoreError {}

impl From<StorageError> for ChatStoreError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

impl From<std::io::Error> for ChatStoreError {
    fn from(e: std::io::Error) -> Self {
        Self::Storage(e.into())
    }
}

pub type ChatStoreResult<T> = Result<T, ChatStoreError>;

pub struct ChatStore {
    dir: PathBuf,
    index: Mutex<ChatIndex>,
    limits: Mutex<Vec<UsageLimits>>,
    sequence: AtomicU32,
}

impl ChatStore {
    pub fn open(dir: PathBuf) -> StorageResult<Self> {
        fs::create_dir_all(&dir)?;
        let index_path = dir.join(INDEX_FILE);
        let index = match json_file::read::<ChatIndex>(&index_path) {
            Ok(index) => index.unwrap_or_default(),
            Err(e @ StorageError::Json { .. }) => {
                log::warn!("{e}; starting with an empty chat list");
                let _ = fs::rename(&index_path, index_path.with_extension("invalid.json"));
                ChatIndex::default()
            }
            Err(e) => return Err(e),
        };
        let limits = json_file::read::<Vec<UsageLimits>>(&dir.join(LIMITS_FILE))
            .inspect_err(|e| log::warn!("ignoring usage limits: {e}"))
            .ok()
            .flatten()
            .unwrap_or_default();
        Ok(Self {
            dir,
            index: Mutex::new(index),
            limits: Mutex::new(limits),
            sequence: AtomicU32::new(0),
        })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn transcript_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.jsonl"))
    }

    pub fn list(&self) -> Vec<ChatSummary> {
        let mut chats = self.lock_index().chats.clone();
        chats.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        chats
    }

    pub fn get(&self, id: &str) -> ChatStoreResult<ChatSummary> {
        self.lock_index()
            .chats
            .iter()
            .find(|c| c.id == id)
            .cloned()
            .ok_or_else(|| ChatStoreError::NotFound(id.to_owned()))
    }

    pub fn create(&self, agent: AgentId, selected_model: Option<String>) -> ChatStoreResult<ChatSummary> {
        let at = now();
        let chat = ChatSummary {
            id: self.next_id("c"),
            title: String::new(),
            agent,
            model: None,
            selected_model,
            session_id: None,
            pinned: false,
            created_at: at.clone(),
            updated_at: at,
            message_count: 0,
            usage: Default::default(),
        };
        let mut index = self.lock_index();
        index.chats.push(chat.clone());
        self.write_index(&index)?;
        log::info!("created chat {} ({})", chat.id, agent.name());
        Ok(chat)
    }

    pub fn update(&self, id: &str, change: impl FnOnce(&mut ChatSummary)) -> ChatStoreResult<ChatSummary> {
        let mut index = self.lock_index();
        let chat = index
            .chats
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| ChatStoreError::NotFound(id.to_owned()))?;
        change(chat);
        let updated = chat.clone();
        self.write_index(&index)?;
        Ok(updated)
    }

    pub fn delete(&self, id: &str) -> ChatStoreResult<()> {
        let mut index = self.lock_index();
        let before = index.chats.len();
        index.chats.retain(|c| c.id != id);
        if index.chats.len() == before {
            return Err(ChatStoreError::NotFound(id.to_owned()));
        }
        self.write_index(&index)?;
        match fs::remove_file(self.transcript_path(id)) {
            Err(e) if e.kind() != ErrorKind::NotFound => log::warn!("could not delete the transcript of {id}: {e}"),
            _ => {}
        }
        log::info!("deleted chat {id}");
        Ok(())
    }

    pub fn messages(&self, id: &str) -> ChatStoreResult<Vec<ChatMessage>> {
        self.get(id)?;
        let text = match fs::read_to_string(self.transcript_path(id)) {
            Ok(text) => text,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };
        Ok(text
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).inspect_err(|e| log::warn!("skipping a message of {id}: {e}")).ok())
            .collect())
    }

    pub fn append(&self, id: &str, message: &ChatMessage) -> ChatStoreResult<ChatSummary> {
        self.get(id)?;
        let mut line = serde_json::to_vec(message).map_err(|source| StorageError::Json {
            path: self.transcript_path(id),
            source,
        })?;
        line.push(b'\n');
        let mut file = OpenOptions::new().create(true).append(true).open(self.transcript_path(id))?;
        file.write_all(&line)?;
        file.sync_data()?;
        let at = message.at.clone();
        self.update(id, |chat| {
            chat.message_count += 1;
            chat.updated_at = at;
        })
    }

    pub fn new_message_id(&self) -> String {
        self.next_id("m")
    }

    pub fn limits(&self) -> Vec<UsageLimits> {
        self.lock_limits().clone()
    }

    pub fn save_limits(&self, limits: UsageLimits) -> ChatStoreResult<()> {
        let mut all = self.lock_limits();
        all.retain(|l| l.agent != limits.agent);
        all.push(limits);
        json_file::write(&self.dir.join(LIMITS_FILE), &*all)?;
        Ok(())
    }

    fn next_id(&self, prefix: &str) -> String {
        let millis = chrono::Local::now().timestamp_millis();
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed) & 0xffff;
        format!("{prefix}{millis:x}{sequence:04x}")
    }

    fn write_index(&self, index: &ChatIndex) -> StorageResult<()> {
        let document = ChatIndex {
            version: INDEX_VERSION,
            chats: index.chats.clone(),
        };
        json_file::write(&self.dir.join(INDEX_FILE), &document)
    }

    fn lock_index(&self) -> MutexGuard<'_, ChatIndex> {
        self.index.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn lock_limits(&self) -> MutexGuard<'_, Vec<UsageLimits>> {
        self.limits.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::chats::{LimitKind, LimitWindow, MessageStatus, Role};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-chats-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn message(store: &ChatStore, role: Role, text: &str) -> ChatMessage {
        ChatMessage {
            id: store.new_message_id(),
            role,
            at: now(),
            text: text.into(),
            status: MessageStatus::Complete,
            error: None,
        }
    }

    #[test]
    fn chats_and_messages_survive_a_reload() {
        let dir = temp_dir("reload");
        let store = ChatStore::open(dir.clone()).unwrap();
        let chat = store.create(AgentId::Claude, Some("haiku".into())).unwrap();
        store.append(&chat.id, &message(&store, Role::User, "Hi\nthere")).unwrap();
        store.append(&chat.id, &message(&store, Role::Assistant, "**Hello**")).unwrap();
        store.update(&chat.id, |c| c.session_id = Some("ses".into())).unwrap();

        let reloaded = ChatStore::open(dir.clone()).unwrap();
        let summary = reloaded.get(&chat.id).unwrap();
        assert_eq!(summary.message_count, 2);
        assert_eq!(summary.session_id.as_deref(), Some("ses"));
        assert_eq!(summary.selected_model.as_deref(), Some("haiku"));
        let messages = reloaded.messages(&chat.id).unwrap();
        assert_eq!(messages.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(), ["Hi\nthere", "**Hello**"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn delete_removes_the_chat_and_its_transcript() {
        let dir = temp_dir("delete");
        let store = ChatStore::open(dir.clone()).unwrap();
        let chat = store.create(AgentId::Codex, None).unwrap();
        store.append(&chat.id, &message(&store, Role::User, "x")).unwrap();

        store.delete(&chat.id).unwrap();

        assert!(store.list().is_empty());
        assert!(!store.transcript_path(&chat.id).exists());
        assert!(matches!(store.delete(&chat.id), Err(ChatStoreError::NotFound(_))));
        assert!(matches!(store.messages(&chat.id), Err(ChatStoreError::NotFound(_))));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn list_is_newest_first_and_ids_are_unique() {
        let dir = temp_dir("order");
        let store = ChatStore::open(dir.clone()).unwrap();
        let old = store.create(AgentId::Claude, None).unwrap();
        store.update(&old.id, |c| c.title = "old".into()).unwrap();
        let new = store.create(AgentId::Claude, None).unwrap();
        store.update(&new.id, |c| c.title = "new".into()).unwrap();
        store.update(&old.id, |c| c.updated_at = "2020-01-01T00:00:00+07:00".into()).unwrap();

        assert_ne!(old.id, new.id);
        assert_eq!(store.list().iter().map(|c| c.title.as_str()).collect::<Vec<_>>(), ["new", "old"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_index_is_moved_aside_and_bad_lines_are_skipped() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(INDEX_FILE), "{ nope").unwrap();
        let store = ChatStore::open(dir.clone()).unwrap();
        assert!(store.list().is_empty());
        assert!(dir.join("index.invalid.json").is_file());

        let chat = store.create(AgentId::Claude, None).unwrap();
        store.append(&chat.id, &message(&store, Role::User, "ok")).unwrap();
        let mut file = OpenOptions::new().append(true).open(store.transcript_path(&chat.id)).unwrap();
        file.write_all(b"not json\n").unwrap();
        assert_eq!(store.messages(&chat.id).unwrap().len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn limits_are_kept_per_agent() {
        let dir = temp_dir("limits");
        let store = ChatStore::open(dir.clone()).unwrap();
        let limits = |agent, used| UsageLimits {
            agent,
            plan: None,
            at: now(),
            windows: vec![LimitWindow {
                kind: LimitKind::FiveHour,
                used_percent: used,
                resets_at: None,
            }],
        };
        store.save_limits(limits(AgentId::Claude, 10.0)).unwrap();
        store.save_limits(limits(AgentId::Claude, 20.0)).unwrap();
        store.save_limits(limits(AgentId::Codex, 5.0)).unwrap();

        let reloaded = ChatStore::open(dir.clone()).unwrap().limits();
        assert_eq!(reloaded.len(), 2);
        let claude = reloaded.iter().find(|l| l.agent == AgentId::Claude).unwrap();
        assert_eq!(claude.windows[0].used_percent, 20.0);
        fs::remove_dir_all(dir).unwrap();
    }
}
