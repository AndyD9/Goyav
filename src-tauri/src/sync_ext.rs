//! Poison-tolerant locking for `std::sync::Mutex`.
//!
//! A panic while a guard is held poisons the mutex, and `lock().unwrap()`
//! then panics in every later caller: one bug would disable PGP, sync or
//! meeting sign-in until restart. The state behind these mutexes (lock and
//! session maps, the keystore handle, credential caches) stays usable
//! after an interrupted update, so recover the guard instead.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};

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

/// Registry of async locks keyed by account, folder or lifecycle id.
///
/// Entries are weak: holders and waiters keep a lock alive, and unused
/// entries are pruned on the next lookup, so the map never grows with every
/// account or folder ever seen. One registry mutex makes lookup-or-create
/// atomic, so two callers asking for the same key always get the same lock.
pub(crate) struct KeyedLocks<K> {
    locks: Mutex<HashMap<K, Weak<tokio::sync::Mutex<()>>>>,
}

impl<K> Default for KeyedLocks<K> {
    fn default() -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
        }
    }
}

impl<K: Eq + Hash> KeyedLocks<K> {
    /// The lock for `key`, created if no one currently holds or awaits it.
    pub(crate) fn get(&self, key: K) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.locks.lock_unpoisoned();
        locks.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
            return lock;
        }
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        locks.insert(key, Arc::downgrade(&lock));
        lock
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.locks.lock_unpoisoned().len()
    }

    #[cfg(test)]
    pub(crate) fn contains(&self, key: &K) -> bool {
        self.locks.lock_unpoisoned().contains_key(key)
    }
}

#[cfg(test)]
mod tests {
    use super::{KeyedLocks, MutexExt};
    use std::sync::{Arc, Mutex};

    #[test]
    fn keyed_locks_share_a_live_lock_and_prune_unused_ones() {
        let registry = KeyedLocks::<String>::default();
        let first = registry.get("a".into());
        let again = registry.get("a".into());
        assert!(Arc::ptr_eq(&first, &again));
        assert!(!Arc::ptr_eq(&first, &registry.get("b".into())));

        drop(first);
        drop(again);
        // "a" and "b" are no longer held: the next lookup prunes them.
        let _c = registry.get("c".into());
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn keyed_locks_serialize_holders_of_the_same_key() {
        let registry = KeyedLocks::<&'static str>::default();
        let held = registry.get("account").lock_owned().await;
        assert!(registry.get("account").try_lock().is_err());
        assert!(registry.get("other").try_lock().is_ok());
        drop(held);
        assert!(registry.get("account").try_lock().is_ok());
    }

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
