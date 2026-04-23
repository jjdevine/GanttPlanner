-- =============================================================================
-- Gantt Planner — example seed data
-- Optional. Run only if you want to populate the database with the same
-- example tasks the original standalone HTML used to ship with.
-- =============================================================================

INSERT INTO gantt.Tasks (Person, TaskName, StartDate, EndDate, CapacityImpact, Complete, MilestonesJson)
VALUES
    ('bob',  'sales report',       '2025-03-01', NULL,         'high',   0, N'{"phase 1":"2025-05-01","phase 2":"2025-07-01"}'),
    ('bob',  'customer demo',      '2025-04-01', '2025-06-01', 'medium', 0, N'{"contract signing":"2025-04-25"}'),
    ('bob',  'future planning',    NULL,         NULL,         'medium', 0, N'{}'),
    ('fred', 'book event',         '2025-05-01', NULL,         'low',    0, N'{"event occurs":"2025-06-24"}'),
    ('fred', 'old finished task',  '2025-01-01', '2025-02-01', 'medium', 1, N'{}');
GO
