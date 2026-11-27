//! Phase customization: the Customization section of Project settings.
use tauri::{AppHandle, Manager, Runtime};

use super::{CommandError, CommandResult, blocking};
use crate::features::projects::customization::{self, Customization, CustomizationError, CustomizationView, TemplateChange, TemplateContent};
use crate::features::projects::registry::ProjectRegistry;

impl From<CustomizationError> for CommandError {
    fn from(e: CustomizationError) -> Self {
        CommandError::new(e.code(), e)
    }
}

/// The saved customization of a project plus the bundled defaults in its document language.
#[tauri::command]
pub async fn projects_customization_get<R: Runtime>(app: AppHandle<R>, id: String) -> CommandResult<CustomizationView> {
    blocking(move || customization::get(&app.state::<ProjectRegistry>(), &id))
        .await?
        .map_err(Into::into)
}

/// Saves the Initial phase customization together with its template changes.
#[tauri::command]
pub async fn projects_customization_save<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    customization: Customization,
    templates: Vec<TemplateChange>,
) -> CommandResult<Customization> {
    blocking(move || customization::save(&app.state::<ProjectRegistry>(), &id, customization, templates))
        .await?
        .map_err(Into::into)
}

/// Name and text of the template attached to an artifact, for the preview dialog.
#[tauri::command]
pub async fn projects_template_read<R: Runtime>(app: AppHandle<R>, id: String, artifact_id: String) -> CommandResult<TemplateContent> {
    blocking(move || customization::read_template(&app.state::<ProjectRegistry>(), &id, &artifact_id))
        .await?
        .map_err(Into::into)
}
