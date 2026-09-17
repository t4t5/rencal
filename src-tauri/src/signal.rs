//! A coalescing "something changed" notification. Many `notify()` calls before
//! a subscriber wakes collapse into one wakeup, which is what "go refetch"
//! wants.

use tokio::sync::watch;

pub struct Signal(watch::Sender<u64>);

impl Signal {
    pub fn new() -> Self {
        Self(watch::channel(0).0)
    }

    pub fn notify(&self) {
        self.0.send_modify(|generation| *generation += 1);
    }

    pub fn subscribe(&self) -> watch::Receiver<u64> {
        self.0.subscribe()
    }
}

impl Default for Signal {
    fn default() -> Self {
        Self::new()
    }
}
