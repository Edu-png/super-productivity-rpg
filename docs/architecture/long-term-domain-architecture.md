# Long-term domain architecture

This application is expected to retain years of user history. New features must
follow these rules.

## Storage tiers

- `localStorage`: small boot preferences only. Never store tasks, sessions,
  inventory, history, flashcards, reviews, analytics, or binary assets.
- IndexedDB: offline source of truth for large domain data.
- Files: user-selected exports and backups.
- Remote sync: future adapter behind the same repository contracts.

The Academia Arcana uses `AcademyRepository`; its IndexedDB implementation can be
replaced by SQLite, PostgreSQL, or Supabase without changing application services
or UI components. Custom RPG and Habit Tracker state is migrated from legacy
localStorage into `DomainStateStore`.

## Domain boundaries

| Domain | Owns | May communicate through |
| --- | --- | --- |
| Study | hierarchy, materials, sessions | typed application services |
| Review | schedules and review policy | flashcard repository |
| Flashcards | cards, decks, media references | review service |
| Dashboard | read models only | aggregate repository |
| Calendar | scheduled activities | public scheduling contracts |
| Projects | project metadata | project selectors/services |
| RPG | characters, XP, quests | reward events |
| Inventory | items and equipment | inventory service |
| World | realms and travel | world service |
| Analytics | daily/monthly/yearly aggregates | append/update events |
| Persistence | schemas and migrations | repository interfaces |

No UI component may access IndexedDB directly.

## Query and rendering rules

- Every growing table needs indexes matching its screen queries.
- Lists over 100 items require paging or virtualization.
- Daily review queries load only due cards and have a hard page size.
- Dashboards read incremental aggregates, never the complete session history.
- Calendar queries are bounded by visible dates.
- Components should stay close to 300 lines; split by responsibility.
- Signals/stores contain screen state and bounded collections, not entire tables.

## History and synchronization

Records carry IDs, timestamps, revisions, a device ID, and tombstones. Deletes
are soft until compaction/export policy explicitly removes them. This supports
future multi-device conflict resolution without changing domain models.

## Backup policy

Each domain must support independent JSON export and import. A complete backup is
the union of domain exports plus a manifest and schema versions. Imports are
validated before writing and must remain forward-migratable.

## Migration order for existing custom features

1. RPG and Habit Tracker large state: migrated to `DomainStateStore`.
2. Academia Arcana: normalized IndexedDB tables and incremental aggregates.
3. Split RPG inventory/history into record-level repositories as their volume
   grows beyond bounded profile state.
4. Add versioned backup manifest covering every custom domain.
5. Add remote outbox, device identity, and conflict policies before cloud sync.

Existing Super Productivity task storage and operation-log synchronization are
preserved; they already use IndexedDB/SQLite-oriented persistence and must not be
replaced by a second task database.
