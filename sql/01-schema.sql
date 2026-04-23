-- =============================================================================
-- Gantt Planner — Azure SQL schema
-- Run this script ONCE against your Azure SQL database.
-- Safe to re-run: it uses IF NOT EXISTS guards.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'gantt')
    EXEC('CREATE SCHEMA gantt');
GO

-- -----------------------------------------------------------------------------
-- Tasks table
--   - One row per task.
--   - Milestones are stored as a JSON document on the task row to mirror the
--     original JSON shape exactly { "label": "yyyy-mm-dd", ... }.
--   - StartDate / EndDate are nullable so "floating" tasks (no start) and
--     open-ended tasks (no end) round-trip cleanly.
-- -----------------------------------------------------------------------------
IF OBJECT_ID('gantt.Tasks', 'U') IS NULL
BEGIN
    CREATE TABLE gantt.Tasks (
        Id              uniqueidentifier    NOT NULL CONSTRAINT DF_Tasks_Id DEFAULT NEWID(),
        Person          nvarchar(200)       NOT NULL,
        TaskName        nvarchar(500)       NOT NULL,
        StartDate       date                NULL,
        EndDate         date                NULL,
        CapacityImpact  nvarchar(10)        NOT NULL CONSTRAINT DF_Tasks_Impact DEFAULT 'medium',
        Complete        bit                 NOT NULL CONSTRAINT DF_Tasks_Complete DEFAULT 0,
        MilestonesJson  nvarchar(max)       NOT NULL CONSTRAINT DF_Tasks_Milestones DEFAULT N'{}',
        CreatedUtc      datetime2(0)        NOT NULL CONSTRAINT DF_Tasks_Created DEFAULT SYSUTCDATETIME(),
        UpdatedUtc      datetime2(0)        NOT NULL CONSTRAINT DF_Tasks_Updated DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_Tasks PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT CK_Tasks_Impact CHECK (CapacityImpact IN ('high','medium','low')),
        CONSTRAINT CK_Tasks_Milestones_IsJson CHECK (ISJSON(MilestonesJson) = 1)
    );

    CREATE INDEX IX_Tasks_Person ON gantt.Tasks (Person) INCLUDE (TaskName, StartDate, EndDate);
END
GO

-- -----------------------------------------------------------------------------
-- Touch UpdatedUtc on every UPDATE so clients can detect server-side changes.
-- -----------------------------------------------------------------------------
IF OBJECT_ID('gantt.TR_Tasks_Updated', 'TR') IS NOT NULL
    DROP TRIGGER gantt.TR_Tasks_Updated;
GO

CREATE TRIGGER gantt.TR_Tasks_Updated
ON gantt.Tasks
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t
       SET UpdatedUtc = SYSUTCDATETIME()
      FROM gantt.Tasks t
      JOIN inserted i ON i.Id = t.Id;
END
GO

-- -----------------------------------------------------------------------------
-- Permissions for the SWA-managed identity / SQL login that Data API Builder
-- uses. Replace [gantt_app_user] with whatever login/user you create.
-- (Commented out by default — see docs/SETUP.md for the recommended setup.)
-- -----------------------------------------------------------------------------
-- CREATE USER [gantt_app_user] FROM LOGIN [gantt_app_login];
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gantt.Tasks TO [gantt_app_user];
-- GO
