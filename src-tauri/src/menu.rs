//! Native macOS application menu.

use tauri::{
    AppHandle, Emitter, Runtime,
    menu::{Menu, MenuEvent, MenuItemBuilder, SubmenuBuilder},
};
use tauri_plugin_opener::OpenerExt;

const WEBSITE_URL: &str = "https://rencal.org";
const ISSUES_URL: &str = "https://github.com/t4t5/rencal/issues/new";

pub fn build_menu<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;

    let app_menu = SubmenuBuilder::new(handle, "renCal")
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_event = MenuItemBuilder::with_id("compose-event", "New Event")
        .accelerator("CmdOrCtrl+N")
        .build(handle)?;
    let file_menu = SubmenuBuilder::new(handle, "File")
        .item(&new_event)
        .separator()
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Views use Cmd+1/2/3 to avoid clobbering system Cmd+W (close) / Cmd+M (minimize).
    let week = MenuItemBuilder::with_id("week", "Week")
        .accelerator("CmdOrCtrl+1")
        .build(handle)?;
    let month = MenuItemBuilder::with_id("month", "Month")
        .accelerator("CmdOrCtrl+2")
        .build(handle)?;
    let board = MenuItemBuilder::with_id("board", "Board")
        .accelerator("CmdOrCtrl+3")
        .build(handle)?;
    let today = MenuItemBuilder::with_id("today", "Go to Today")
        .accelerator("CmdOrCtrl+T")
        .build(handle)?;
    let go_to_date = MenuItemBuilder::with_id("go-to-date", "Go to Date…")
        .accelerator("CmdOrCtrl+G")
        .build(handle)?;
    let view_menu = SubmenuBuilder::new(handle, "View")
        .item(&week)
        .item(&month)
        .item(&board)
        .separator()
        .item(&today)
        .item(&go_to_date)
        .build()?;

    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .maximize()
        .build()?;

    let shortcuts = MenuItemBuilder::with_id("shortcuts", "Keyboard Shortcuts")
        .accelerator("CmdOrCtrl+/")
        .build(handle)?;
    let website = MenuItemBuilder::with_id("help-website", "renCal Website").build(handle)?;
    let issues = MenuItemBuilder::with_id("help-issues", "Report an Issue").build(handle)?;
    let help_menu = SubmenuBuilder::new(handle, "Help")
        .item(&shortcuts)
        .separator()
        .item(&website)
        .item(&issues)
        .build()?;

    Menu::with_items(
        handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        "help-website" => {
            let _ = app.opener().open_url(WEBSITE_URL, None::<&str>);
        }
        "help-issues" => {
            let _ = app.opener().open_url(ISSUES_URL, None::<&str>);
        }
        id => {
            let _ = app.emit("menu-action", id);
        }
    }
}
