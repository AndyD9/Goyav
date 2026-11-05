//! Poison-tolerant locking for `std::sync::Mutex`.
//!
//! A panic while a guard is held poisons the mutex, and `lock().unwrap()`
//! then panics in every later caller: one bug would disable PGP, sync or
//! meeting sign-in until restart. The state behind these mutexes (lock and
//! session maps, the keystore handle, credential caches) stays usable
//! after an interrupted update, so recover the guard instead.

use std::sync::{Mutex, MutexGuard, PoisonError};

pub(crate) trait MutexExt<T: ?Sized> {
    /// `lock()` that recovers the guard if a previous holder panicked.
    fn lock_unpoisoned(&self) -> MutexGuard<'_, T>;
}

impl<T: ?Sized> MutexExt<T> for Mutex<T> {
    fn lock_unpoisoned(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|poisoned| {
            log::error!("Recovering a mutex poisoned by an earlier panic");
            PoisonError::into_inner(poisoned)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::MutexExt;
    use std::sync::{Arc, Mutex};

    #[test]
    fn recovers_a_poisoned_mutex() {
        let shared = Arc::new(Mutex::new(1));
        let poisoner = Arc::clone(&shared);
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.lock().unwrap();
            panic!("poison the mutex");
        })
        .join();
        assert!(shared.is_poisoned());
        *shared.lock_unpoisoned() += 1;
        assert_eq!(*shared.lock_unpoisoned(), 2);
    }
}
