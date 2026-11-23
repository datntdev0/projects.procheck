// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod commands;
mod container;
mod features;
mod infra;
mod shared;

fn main() {
    bootstrap::run();
}
