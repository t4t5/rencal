//! Reminder notifications on macOS via `UNUserNotificationCenter`.
//!
//! One delegate, registered at startup, receives clicks as callbacks, so
//! posting a notification is fire-and-forget and no thread waits on it.
//! See `docs/notifications.md`.

use std::sync::{Arc, OnceLock};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{AllocAnyThread, DefinedClass, define_class, msg_send};
use objc2_foundation::{NSBundle, NSDictionary, NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationDefaultActionIdentifier, UNNotificationPresentationOptions,
    UNNotificationRequest, UNNotificationResponse, UNNotificationSound, UNUserNotificationCenter,
    UNUserNotificationCenterDelegate,
};
use reminder_core::ReminderNotification;
use tauri::AppHandle;

use rencal_core::state::AppState;

const EVENT_URL_KEY: &str = "event_url";

/// The center holds its delegate weakly, so this keeps it alive for the
/// lifetime of the process.
static DELEGATE: OnceLock<Retained<NotificationDelegate>> = OnceLock::new();

struct DelegateIvars {
    app: AppHandle,
    state: Arc<AppState>,
}

define_class!(
    // SAFETY:
    // - NSObject has no subclassing requirements.
    // - `NotificationDelegate` does not implement `Drop`.
    #[unsafe(super(NSObject))]
    #[name = "RencalNotificationDelegate"]
    #[ivars = DelegateIvars]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            // Without this, banners are suppressed while renCal is frontmost.
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive_response(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::DynBlock<dyn Fn()>,
        ) {
            self.handle_response(response);
            completion_handler.call(());
        }
    }
);

impl NotificationDelegate {
    fn new(app: AppHandle, state: Arc<AppState>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(DelegateIvars { app, state });
        unsafe { msg_send![super(this), init] }
    }

    fn handle_response(&self, response: &UNNotificationResponse) {
        // Only a click on the notification body opens the event; dismissals
        // and other actions are ignored.
        if *response.actionIdentifier() != *unsafe { UNNotificationDefaultActionIdentifier } {
            return;
        }

        let user_info = response.notification().request().content().userInfo();
        let Some(event_url) = user_info
            .objectForKey(&NSString::from_str(EVENT_URL_KEY))
            .and_then(|value| value.downcast_ref::<NSString>().map(ToString::to_string))
        else {
            log::warn!("clicked notification has no event url");
            return;
        };

        let DelegateIvars { app, state } = self.ivars();
        crate::deep_links::enqueue_urls(app, &state.deep_links, &[event_url]);
        crate::focus_main_window(app);
    }
}

/// `UNUserNotificationCenter` raises an Objective-C exception when the
/// binary is not inside a `.app` (e.g. `just dev`). Tauri embeds an
/// Info.plist in dev binaries, so check the bundle path rather than the
/// bundle identifier.
fn is_bundled() -> bool {
    static BUNDLED: OnceLock<bool> = OnceLock::new();
    *BUNDLED.get_or_init(|| {
        NSBundle::mainBundle()
            .bundlePath()
            .to_string()
            .ends_with(".app")
    })
}

/// Registers the click delegate and requests notification permission. Must
/// run during app launch so clicks that cold-launch renCal are delivered.
pub fn init(app: AppHandle, state: Arc<AppState>) {
    if !is_bundled() {
        log::info!("notifications require a bundled build; reminders will only be logged");
        return;
    }

    let center = UNUserNotificationCenter::currentNotificationCenter();
    let delegate = DELEGATE.get_or_init(|| NotificationDelegate::new(app, state));
    center.setDelegate(Some(ProtocolObject::from_ref(&**delegate)));

    let completion = RcBlock::new(|granted: Bool, error: *mut NSError| {
        if let Some(error) = unsafe { error.as_ref() } {
            log::warn!(
                "notification authorization failed: {}",
                error.localizedDescription()
            );
        } else if granted.as_bool() {
            log::info!("notification authorization granted");
        } else {
            log::warn!("notification authorization denied; reminders will not be shown");
        }
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &completion,
    );
}

/// Posts `reminder` for immediate delivery. Non-blocking.
pub fn post(reminder: &ReminderNotification) {
    if !is_bundled() {
        log::info!(
            "reminder (not shown in unbundled build): {}",
            reminder.title
        );
        return;
    }

    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(&reminder.title));
    content.setBody(&NSString::from_str(&reminder.body));
    content.setSound(Some(&UNNotificationSound::defaultSound()));

    let event_url = NSString::from_str(&reminder.event_url);
    let user_info =
        NSDictionary::from_slices(&[&*NSString::from_str(EVENT_URL_KEY)], &[&*event_url]);
    // SAFETY: userInfo is an untyped dictionary; string keys and values are
    // property-list types, which is all UN requires.
    unsafe { content.setUserInfo(user_info.cast_unchecked()) };

    // Keyed by event, so a later reminder for the same event replaces the
    // earlier one in Notification Center instead of stacking.
    let request =
        UNNotificationRequest::requestWithIdentifier_content_trigger(&event_url, &content, None);

    let completion = RcBlock::new(|error: *mut NSError| {
        if let Some(error) = unsafe { error.as_ref() } {
            log::warn!("show err: {}", error.localizedDescription());
        }
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .addNotificationRequest_withCompletionHandler(&request, Some(&completion));
}
